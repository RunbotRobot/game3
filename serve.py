#!/usr/bin/env python3
"""Static server for the game.

python -m http.server sends no Cache-Control and no ETag — only Last-Modified —
so browsers fall back to heuristic caching and will happily serve ES modules from
cache without revalidating. Because version.json is fetched with no-store, that
produces the worst possible failure: the page sees a new build and offers a reload,
then reloads into the old JavaScript. Every response here is no-store.
"""

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '404' in (fmt % args):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
