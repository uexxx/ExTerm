#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited.
"""Package the minified, release-only ExTerm build:
  <out>/ExTerm-v17.0/          exterm.html (hardened build) + launchers + daemon + Docker + docs + SHA256SUMS.txt
  <out>/ExTerm-v17.0.zip
  <out>/ExTerm-v17.0-android.apk
  <out>/SHA256SUMS.txt         zip, apk and the app file
Run python build.py --harden and tools/build_apk.py first. Usage: python tools/package_release.py [--out DIR]
"""
import argparse, hashlib, os, pathlib, shutil, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
V = "17.0"
NAME = "ExTerm-v" + V
TEXT_LF = ("serve.py", "serve.ps1", "exterm_ops.py", "start-exterm.sh", "start-exterm.command", "Dockerfile", "docker-compose.yml")
FILES = ("serve.py", "serve.ps1", "exterm_ops.py", "start-exterm.bat", "start-exterm.sh", "start-exterm.command", "Dockerfile", "docker-compose.yml",
         "LICENSE", "README.md", "CHANGELOG.md", "BRAND_GUIDELINES.md", "SECURITY.md")


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(pathlib.Path(os.environ.get("USERPROFILE", str(pathlib.Path.home()))) / "Desktop"))
    out = pathlib.Path(ap.parse_args().out)
    app, apk = ROOT / "dist" / "exterm.min.html", ROOT / "dist" / (NAME + "-android.apk")
    for p in (app, apk):
        if not p.exists():
            raise SystemExit("missing " + str(p) + ": run python build.py --harden and python tools/build_apk.py")
    pkg = out / NAME
    if pkg.exists():
        shutil.rmtree(pkg)
    pkg.mkdir(parents=True)
    shutil.copy(app, pkg / "exterm.html")
    for f in FILES:
        b = (ROOT / f).read_bytes()
        (pkg / f).write_bytes(b.replace(b"\r\n", b"\n") if f in TEXT_LF else b)
    for icon in ("icon-192.png", "icon-512.png"):
        if (ROOT / "dist" / icon).exists():
            shutil.copy(ROOT / "dist" / icon, pkg / icon)
    names = sorted(p.name for p in pkg.iterdir() if p.is_file())
    (pkg / "SHA256SUMS.txt").write_bytes(("\n".join(sha(pkg / n) + "  " + n for n in names) + "\n").encode())
    zp = out / (NAME + ".zip")
    if zp.exists():
        zp.unlink()
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(pkg.rglob("*")):
            if p.is_file():
                z.write(p, NAME + "/" + p.relative_to(pkg).as_posix())
    shutil.copy(apk, out / apk.name)
    rel = [(zp.name, zp), (apk.name, out / apk.name), ("exterm.html", pkg / "exterm.html")]
    (out / "SHA256SUMS.txt").write_bytes(("\n".join(sha(p) + "  " + n for n, p in rel) + "\n").encode())
    for n, p in rel:
        print(f"{n:32} {p.stat().st_size / 1024:8.0f} KB  {sha(p)[:16]}…")
    print("packaged " + str(pkg))


if __name__ == "__main__":
    main()
