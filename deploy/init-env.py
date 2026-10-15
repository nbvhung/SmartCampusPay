"""Create secrets locally on the server without printing or overwriting them."""
import argparse
import os
from pathlib import Path
import re
import secrets


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", args.domain) or "." not in args.domain:
        parser.error("domain must be a hostname, without https:// or path")
    if not re.fullmatch(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", args.email):
        parser.error("invalid email")
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}", args.tag):
        parser.error("invalid image tag")
    root = Path(__file__).resolve().parent.parent
    content = (root / "deploy/production.env.example").read_text(encoding="utf-8")
    values = {
        "DOMAIN": args.domain, "ACME_EMAIL": args.email, "RELEASE_TAG": args.tag,
        **{name: secrets.token_hex(32) for name in (
            "DB_PASS", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "DEFAULT_ADMIN_PASSWORD"
        )},
    }
    for key, value in values.items():
        content = re.sub(rf"^{key}=.*$", lambda _: f"{key}={value}", content, flags=re.MULTILINE)
    destination = root / ".env.production"
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(content)
    print("Created .env.production. Secrets were not printed. Keep this file private and backed up.")


if __name__ == "__main__":
    main()
