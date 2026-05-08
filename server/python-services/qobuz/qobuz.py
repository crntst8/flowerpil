import os
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
import re
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

APP_ID = "735532640"  # Public app id used by the Qobuz widget


# ----------------------------
#  Parsers
# ----------------------------
def parse_standard_playlist(soup: BeautifulSoup, base_url: str) -> list:
    tracks = []

    for container in soup.select("div.track__items"):
        title_el = container.select_one(".track__item--name span")
        artist_el = container.select_one(".track__item--artist")
        album_el = container.select_one(".track__item--album")
        duration_el = container.select_one(".track__item--duration")

        title = title_el.get_text(strip=True) if title_el else None

        artist = None
        if artist_el:
            links = artist_el.select("a")
            if links:
                artist = " ".join(a.get_text(strip=True) for a in links)
            else:
                artist = artist_el.get_text(" ", strip=True)

        album = None
        album_url = None
        if album_el:
            a = album_el.select_one("a")
            if a:
                album = a.get_text(strip=True)
                href = a.get("href")
                album_url = urljoin(base_url, href) if href else None
            else:
                album = album_el.get_text(strip=True)

        duration = duration_el.get_text(strip=True) if duration_el else None

        if not title or not artist:
            continue

        tracks.append(
            {
                "title": title,
                "artist": artist,
                "album": album,
                "album_url": album_url,
                "duration": duration,
            }
        )

    return tracks


def fetch_api_playlist(session: requests.Session, playlist_id: str) -> list:
    """
    Fetch playlist tracks via the public JSON API used by the widget.
    This works even when the widget HTML is JS-only.
    """
    api_url = "https://www.qobuz.com/api.json/0.2/playlist/get"
    params = {
        "playlist_id": playlist_id,
        "app_id": APP_ID,
        "extra": "tracks",
        "limit": 500,
    }

    try:
        resp = session.get(api_url, params=params, timeout=(5, 30))
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    items = data.get("tracks", {}).get("items", []) or []
    tracks = []

    for item in items:
        album = item.get("album") or {}
        performer = item.get("performer") or {}
        artist = (
            performer.get("name")
            or (album.get("artist") or {}).get("name")
            or ""
        ).strip()

        title = (item.get("title") or "").strip()
        version = (item.get("version") or "").strip()
        if version:
            title = f"{title} ({version})"

        album_title = (album.get("title") or "").strip() or None

        duration = item.get("duration")
        isrc = item.get("isrc")

        if not title or not artist:
            continue

        tracks.append(
            {
                "title": title,
                "artist": artist,
                "album": album_title,
                "album_url": None,
                "duration": duration,
                "isrc": isrc,
            }
        )

    return tracks


def parse_widget_playlist(soup: BeautifulSoup) -> list:
    """
    Handles widget embeds such as https://widget.qobuz.com/playlist/<id>
    where tracks are rendered with .track__name / .track__artist / .track__duration.
    """
    tracks = []

    for container in soup.select("div.styles__TrackContainer-gJgMOx, div.iExdYG"):
        title_el = container.select_one(".track__name")
        artist_el = container.select_one(".track__artist")
        duration_el = container.select_one(".track__duration")

        title = title_el.get_text(strip=True) if title_el else None
        artist = artist_el.get_text(strip=True) if artist_el else None
        duration = duration_el.get_text(strip=True) if duration_el else None

        if not title or not artist:
            continue

        tracks.append(
            {
                "title": title,
                "artist": artist,
                "album": None,
                "album_url": None,
                "duration": duration,
            }
        )

    return tracks


# ----------------------------
#  Session (robust HTTP)
# ----------------------------
def make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"]
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# ----------------------------
#  Extract ID from URL
# ----------------------------
def extract_qobuz_id(url: str) -> str:
    """
    Takes:
        https://www.qobuz.com/au-en/playlists/ausify-our-country-sounds/41916199
    Returns:
        41916199
    """
    path = urlparse(url).path.rstrip("/")
    # Prefer the last numeric segment
    for segment in reversed(path.split("/")):
        if segment.isdigit():
            return segment

    # Fallback: grab the last digit run anywhere in the path/query
    match = re.search(r"(\\d+)(?!.*\\d)", url)
    return match.group(1) if match else ""


# ----------------------------
#  Scraper
# ----------------------------
def scrape_qobuz_playlist(url: str):
    session = make_session()

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/129.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;"
            "q=0.9,image/avif,image/webp,*/*;q=0.8"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }

    resp = session.get(url, headers=headers, timeout=(5, 60))
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try HTML first (standard pages), then widget DOM, then API fallback for JS-only widgets
    tracks = parse_standard_playlist(soup, url)

    if not tracks:
        tracks = parse_widget_playlist(soup)

    if not tracks:
        playlist_id = extract_qobuz_id(url)
        tracks = fetch_api_playlist(session, playlist_id)

    return tracks


# ----------------------------
#  Save JSON
# ----------------------------
def save_playlist_json(playlist_id: str, tracks: list):
    out_dir = os.path.join("data", "qobuz")
    os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, f"{playlist_id}.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tracks, f, indent=2, ensure_ascii=False)

    return out_path


# ----------------------------
#  Entry point
# ----------------------------
if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Usage: python3 qobuz_import.py <qobuz-playlist-url>")
        sys.exit(1)

    url = sys.argv[1]
    playlist_id = extract_qobuz_id(url)

    print(f"Extracted ID: {playlist_id}")
    print("Scraping...")

    tracks = scrape_qobuz_playlist(url)

    print(f"Found {len(tracks)} tracks.")
    out = save_playlist_json(playlist_id, tracks)

    print(f"Saved: {out}")
