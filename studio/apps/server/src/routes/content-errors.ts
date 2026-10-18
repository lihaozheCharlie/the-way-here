import type { FastifyReply } from "fastify";
import { ContentRequestError } from "../modules/content/content-error.js";
import { ImportRequestError } from "../modules/imports/import-store.js";

export async function handleContent<T>(reply: FastifyReply, action: () => Promise<T>, successCode = 200): Promise<T | FastifyReply> {
  try {
    const result = await action();
    return successCode === 200 ? result : reply.code(successCode).send(result);
  } catch (error) {
    if (error instanceof ContentRequestError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof ImportRequestError) return reply.code(error.statusCode).send({ error: error.message });
    if (["EACCES", "EPERM"].includes((error as NodeJS.ErrnoException)?.code || "")) return reply.code(403).send({ error: "无法读写文件，请重新授权文件夹访问权限", permissionRequired: true });
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return reply.code(404).send({ error: "原文件夹不可用，请重新连接" });
    throw error;
  }
}
