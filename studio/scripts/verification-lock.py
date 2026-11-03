"""Hold one workspace lock until its private worker process group has finished."""
import fcntl
import json
import os
import signal
import subprocess
import sys
import time

lock_path, token, command_json = sys.argv[1:4]
# Keep this inode permanently: unlinking an advisory lock can create two owners.
fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)

def read_owner():
    os.lseek(fd, 0, os.SEEK_SET)
    text = os.read(fd, 65536).decode("utf-8")
    return json.loads(text) if text.strip() else None

def alive(pid):
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True

def group_alive(pgid):
    if not isinstance(pgid, int) or pgid <= 0:
        return False
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # Reaped execution is finished even if an orphan zombie awaits the OS reaper.
    result = subprocess.run(["/bin/ps", "-axo", "pgid=,stat="], capture_output=True, text=True)
    if result.returncode:
        return True
    return any(len(parts) == 2 and parts[0] == str(pgid) and not parts[1].startswith("Z")
               for parts in (line.split() for line in result.stdout.splitlines()))

def store(owner):
    payload = (json.dumps(owner) + "\n").encode("utf-8")
    os.lseek(fd, 0, os.SEEK_SET)
    os.ftruncate(fd, 0)
    os.write(fd, payload)
    os.fsync(fd)

try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print("iOS verification is already running for this workspace; no report was changed.", file=sys.stderr)
    sys.exit(73)

owner = None
worker = None
try:
    try:
        previous = read_owner()
    except (ValueError, UnicodeError):
        raise RuntimeError("The verification lock owner cannot be verified; no report was changed.")
    if previous is not None:
        if (not isinstance(previous, dict) or previous.get("version") != 1
                or not isinstance(previous.get("token"), str) or not previous.get("token")
                or not isinstance(previous.get("launcherPid"), int) or isinstance(previous.get("launcherPid"), bool)
                or previous["launcherPid"] <= 0
                or any(value is not None and (not isinstance(value, int) or isinstance(value, bool) or value <= 0)
                       for value in [previous.get("workerPid"), previous.get("processGroup")])):
            raise RuntimeError("The verification lock owner is invalid; no report was changed.")
        if alive(previous.get("launcherPid")) or alive(previous.get("workerPid")) or group_alive(previous.get("processGroup")):
            print("An earlier iOS verification owner or its child task is still alive; no report was changed.", file=sys.stderr)
            sys.exit(73)
    owner = {"version": 1, "token": token, "launcherPid": os.getpid(), "workerPid": None, "processGroup": None, "startedAt": time.time()}
    store(owner)
    def forward(signum, _frame):
        if worker is not None:
            try:
                os.killpg(worker.pid, signum)
            except ProcessLookupError:
                pass
    signal.signal(signal.SIGINT, forward)
    signal.signal(signal.SIGTERM, forward)
    env = dict(os.environ, TWH_IOS_VERIFICATION_LOCK_TOKEN=token, TWH_IOS_VERIFICATION_LOCK_PATH=lock_path)
    # A separate process group includes the existing spawnSync Xcode descendants.
    worker = subprocess.Popen(json.loads(command_json), env=env, start_new_session=True)
    owner.update(workerPid=worker.pid, processGroup=worker.pid)
    store(owner)
    code = worker.wait()
    while group_alive(worker.pid):
        time.sleep(0.05)
    sys.exit(code if code >= 0 else 128 - code)
finally:
    if worker is not None and (worker.poll() is None or group_alive(worker.pid)):
        # Even if the launcher encounters an exception, never unlock live children.
        try:
            os.killpg(worker.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        worker.wait()
        while group_alive(worker.pid):
            time.sleep(0.05)
    if owner is not None:
        try:
            if (read_owner() or {}).get("token") == token:
                store(None)
        except (ValueError, UnicodeError):
            pass
    fcntl.flock(fd, fcntl.LOCK_UN)
    os.close(fd)
