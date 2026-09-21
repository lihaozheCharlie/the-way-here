#!/usr/bin/env python3
"""Read only a bound frozen knowledge corpus; emit bounded, line-addressable results."""
import argparse
import json
from pathlib import Path


def retrieve(data, action, page_id=None, terms=(), start=1, limit=20, offset=0):
    pages = {p['pageId']: p for p in data['pages']}
    search = data.get('lifeSearch') or {}
    profiles = {p['pageId']: p for p in (data.get('retrieval') or search).get('profiles', [])}
    catalogue = {p['pageId']: p for p in data.get('catalogue', [])}
    def brief(pid):
        p = profiles.get(pid, catalogue.get(pid, {'pageId': pid}))
        result = {k: p[k] for k in ('pageId', 'title', 'role') if k in p}
        time = p.get('time', {})
        result['time'] = {k: v for k, v in time.items() if k != 'bodyDateClues'}
        result['bodyDateClueCount'] = len(time.get('bodyDateClues', []))
        result['signals'] = [{'id': signal['id'], 'lines': signal['lines'][:5], 'total': len(signal['lines'])} for signal in p.get('signals', [])]
        return result
    if action == 'overview':
        return {'scanned': search.get('scanned'), 'candidates': search.get('candidates'), 'lanes': search.get('lanes'),
                'catalogue': [brief(pid) or {'pageId': pid} for pid in list(pages)[offset:offset + limit]], 'total': len(pages)}
    if action == 'search':
        if not terms:
            raise ValueError('search requires --terms')
        results = []
        for pid, page in pages.items():
            profile = profiles.get(pid, {})
            matches = []
            lines = page['markdown'].splitlines()
            body_start = 0
            if lines and lines[0].strip() == '---':
                body_start = next((i + 1 for i, line in enumerate(lines[1:], 1) if line.strip() in ('---', '...')), 0)
            for n, line in enumerate(lines[body_start:], body_start + 1):
                found = [t for t in terms if t.lower() in line.lower()]
                if found:
                    matches.append({'line': n, 'terms': found, 'text': line[:500], 'truncated': len(line) > 500})
            title_match = any(t.lower() in ' '.join([profile.get('title', pid)] + profile.get('aliases', [])).lower() for t in terms)
            if matches or title_match:
                score = len({t for m in matches for t in m['terms']}) + 3 * title_match
                results.append({'pageId': pid, 'role': profile.get('role'), 'score': score,
                                'matches': matches[:3], 'matchedLines': len(matches)})
        results.sort(key=lambda r: (-r['score'], r['pageId']))
        return {'total': len(results), 'results': results[offset:offset + limit]}
    if page_id not in pages:
        raise ValueError('page is not in this frozen corpus')
    if action == 'read':
        lines = pages[page_id]['markdown'].splitlines()
        return {'profile': brief(page_id), 'pageId': page_id, 'totalLines': len(lines), 'start': start,
                'bodyDateClues': [c for c in profiles.get(page_id, {}).get('time', {}).get('bodyDateClues', []) if start <= c['line'] < start + limit],
                'lines': [{'line': i + 1, 'text': line} for i, line in enumerate(lines) if start <= i + 1 < start + limit]}
    if action == 'neighbors':
        p = profiles.get(page_id, {})
        edges = ([{'direction': 'out', **edge} for edge in p.get('links', [])]
                 + [{'direction': 'in', 'pageId': pid} for pid in p.get('backlinks', [])])
        edges = [edge for edge in edges if edge['pageId'] in pages]
        return {'total': len(edges), 'neighbors': [{**edge, 'profile': brief(edge['pageId'])} for edge in edges[offset:offset + limit]],
                'unresolved': p.get('unresolvedLinks', [])}
    raise ValueError('unknown action')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', required=True)
    parser.add_argument('--knowledge-base', required=True)
    parser.add_argument('--hash', required=True)
    parser.add_argument('--action', choices=['overview', 'search', 'read', 'neighbors'], required=True)
    parser.add_argument('--page')
    parser.add_argument('--terms', nargs='+', default=[])
    parser.add_argument('--start', type=int, default=1)
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--purpose', required=True, help='Short retrieval question, not private reasoning')
    args = parser.parse_args()
    if not (1 <= args.limit <= 200 and args.start >= 1 and args.offset >= 0):
        parser.error('invalid bounds (limit must be 1..200)')
    data = json.loads(Path(args.file).read_text())
    if data.get('knowledgeBaseId') != args.knowledge_base or data.get('inputHash') != args.hash:
        parser.error('frozen corpus identity/version mismatch')
    try:
        result = retrieve(data, args.action, args.page, args.terms, args.start, args.limit, args.offset)
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps({'request': {'action': args.action, 'pageId': args.page, 'terms': args.terms,
                                  'purpose': args.purpose, 'start': args.start, 'offset': args.offset, 'limit': args.limit},
                      'knowledgeBaseId': args.knowledge_base, 'inputHash': args.hash, 'result': result}, ensure_ascii=False))


if __name__ == '__main__':
    main()
