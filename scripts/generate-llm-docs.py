#!/usr/bin/env python3
"""
Generate docs/llm JSON files from docs/features markdown.
- Strips markdown formatting while preserving endpoints, SQL, and JSON keys.
- Writes one JSON file per markdown file to docs/llm.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

FEATURES_DIR = Path('docs/features')
LLM_DIR = Path('docs/llm')

HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)$')
LINK_RE = re.compile(r'\[([^\]]+)\]\([^)]+\)')
HTML_RE = re.compile(r'<[^>]+>')


def strip_inline(text: str) -> str:
    text = LINK_RE.sub(r'\1', text)
    text = text.replace('`', '')
    text = re.sub(r'(\*\*|__)(.*?)\1', r'\2', text)
    text = re.sub(r'(\*|_)(.*?)\1', r'\2', text)
    text = HTML_RE.sub('', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def normalize_list_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r'^[-*+]\s+', '', line)
    line = re.sub(r'^\d+\.\s+', '', line)
    return line


def process_text_block(lines: list[str]) -> str:
    cleaned = [strip_inline(normalize_list_line(line)) for line in lines if line.strip()]
    return ' '.join([c for c in cleaned if c])


def build_blocks(text: str) -> tuple[str, list[str]]:
    title = None
    blocks: list[str] = []
    current: list[str] = []
    in_code = False
    code_lines: list[str] = []

    for line in text.splitlines():
        fence = line.strip().startswith('```')
        if fence:
            if in_code:
                code = '\n'.join(code_lines).rstrip()
                if code:
                    blocks.append(f'CODE:{code}')
                code_lines = []
                in_code = False
            else:
                if current:
                    block = process_text_block(current)
                    if block:
                        blocks.append(block)
                    current = []
                in_code = True
            continue

        if in_code:
            code_lines.append(line.rstrip())
            continue

        match = HEADING_RE.match(line)
        if match:
            if current:
                block = process_text_block(current)
                if block:
                    blocks.append(block)
                current = []
            level = len(match.group(1))
            heading_text = strip_inline(match.group(2).strip())
            if level == 1 and not title:
                title = heading_text
            blocks.append(f'H{level}:{heading_text}')
            continue

        if not line.strip():
            if current:
                block = process_text_block(current)
                if block:
                    blocks.append(block)
                current = []
            continue

        current.append(line)

    if in_code and code_lines:
        code = '\n'.join(code_lines).rstrip()
        if code:
            blocks.append(f'CODE:{code}')

    if current:
        block = process_text_block(current)
        if block:
            blocks.append(block)

    if not title:
        title = 'Untitled'

    return title, blocks


def main() -> None:
    LLM_DIR.mkdir(parents=True, exist_ok=True)
    for md_path in sorted(FEATURES_DIR.glob('*.md')):
        raw = md_path.read_text()
        title, blocks = build_blocks(raw)
        content = '||'.join([b for b in blocks if b])
        out = {"t": title, "c": content}
        out_path = LLM_DIR / f"{md_path.stem}.json"
        out_path.write_text(json.dumps(out, ensure_ascii=True))


if __name__ == '__main__':
    main()
