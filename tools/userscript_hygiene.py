#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import quote

REPO = 'mongkokman91/userscripts'
SCRIPTS = Path('scripts')
MANIFEST = Path('manifest.json')

META_RE = re.compile(r'(^// ==UserScript==\s*$)(.*?)(^// ==/UserScript==\s*$)', re.M | re.S)
LINE_RE = re.compile(r'^\s*//\s*@([^\s]+)(?:\s+(.*))?$', re.M)


def metadata(text):
    m = META_RE.search(text)
    if not m:
        return {}, None
    out = {}
    for key, value in LINE_RE.findall(m.group(2)):
        out.setdefault(key, []).append((value or '').strip())
    return out, m


def version_key(v):
    nums = re.findall(r'\d+', v or '')
    return tuple(int(x) for x in nums) if nums else (0,)


def bump_patch(v):
    nums = re.findall(r'\d+', v or '')
    if not nums:
        return '1.0.0'
    return '.'.join(nums + ['1'])


def git_show(ref, path):
    try:
        return subprocess.check_output(['git', 'show', f'{ref}:{path}'], text=True, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        return None


def rewrite_meta(text, filename, base_ref=None):
    meta, block = metadata(text)
    if not block:
        raise ValueError('missing userscript metadata block')
    name = (meta.get('name') or [''])[0]
    namespace = (meta.get('namespace') or [''])[0]
    version = (meta.get('version') or [''])[0] or '1.0.0'

    if base_ref:
        old = git_show(base_ref, f'scripts/{filename}')
        if old is not None and old != text:
            old_meta, _ = metadata(old)
            old_v = (old_meta.get('version') or [''])[0]
            if version_key(version) <= version_key(old_v):
                version = bump_patch(old_v)

    encoded = quote(filename, safe='')
    homepage = f'https://github.com/{REPO}/blob/main/scripts/{encoded}'
    raw = f'https://raw.githubusercontent.com/{REPO}/main/scripts/{encoded}'

    lines = block.group(2).splitlines()
    managed = {'version', 'homepageURL', 'updateURL', 'downloadURL'}
    kept = [ln for ln in lines if not (re.match(r'^\s*//\s*@([^\s]+)', ln) and re.match(r'^\s*//\s*@([^\s]+)', ln).group(1) in managed)]
    while kept and not kept[0].strip():
        kept.pop(0)
    while kept and not kept[-1].strip():
        kept.pop()
    insert_at = 0
    for i, ln in enumerate(kept):
        if re.match(r'^\s*//\s*@(namespace|name)\b', ln):
            insert_at = i + 1
    managed_lines = [
        f'// @version      {version}',
        f'// @homepageURL  {homepage}',
        f'// @updateURL    {raw}',
        f'// @downloadURL  {raw}',
    ]
    new_inner = '\n' + '\n'.join(kept[:insert_at] + managed_lines + kept[insert_at:]) + '\n'
    new_text = text[:block.start(2)] + new_inner + text[block.end(2):]
    return new_text, {'name': name, 'version': version, 'namespace': namespace}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default=None)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    if not SCRIPTS.exists():
        print('No scripts directory; nothing to do.')
        return 0

    changed = False
    records = []
    for path in sorted(SCRIPTS.glob('*.user.js')):
        text = path.read_text(encoding='utf-8')
        try:
            new_text, info = rewrite_meta(text, path.name, args.base)
        except ValueError as e:
            print(f'ERROR {path}: {e}')
            return 2
        if not info['name']:
            print(f'ERROR {path}: missing @name')
            return 2
        if new_text != text:
            changed = True
            if not args.check:
                path.write_text(new_text, encoding='utf-8')
        records.append({
            'name': info['name'],
            'version': info['version'],
            'path': str(path).replace('\\', '/'),
            'namespace': info['namespace'],
            'status': 'active',
            'authority': REPO,
            'update_policy': 'github-auto-update',
        })

    manifest_text = json.dumps(records, indent=2, ensure_ascii=False) + '\n'
    old_manifest = MANIFEST.read_text(encoding='utf-8') if MANIFEST.exists() else ''
    if manifest_text != old_manifest:
        changed = True
        if not args.check:
            MANIFEST.write_text(manifest_text, encoding='utf-8')

    if args.check and changed:
        print('Userscript hygiene changes are required.')
        return 1
    print(f'Validated {len(records)} userscripts; changed={changed}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
