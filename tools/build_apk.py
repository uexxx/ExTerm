#!/usr/bin/env python3
# Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited.
"""Build ExTerm-v17.3-android.apk without Gradle: aapt2 → javac → d8 → zipalign → apksigner.

Needs JDK 17 (JAVA_HOME or on PATH) and an Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT, or %LOCALAPPDATA%\\Android\\Sdk)
with platforms;android-34 and build-tools;34.0.0. The release key lives OUTSIDE the repo (EXTERM_KEYSTORE, default
%LOCALAPPDATA%\\ExTerm\\exterm-release.jks or ~/.exterm/exterm-release.jks) and is created on first use.

Usage: python tools/build_apk.py [--html dist/exterm.min.html] [--out dist/ExTerm-v17.3-android.apk]
"""
import argparse, os, pathlib, secrets, shutil, subprocess, sys, tempfile, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION_NAME, VERSION_CODE, MIN_SDK, TARGET_SDK = "17.3", "1730", "24", "34"
EXE = ".exe" if os.name == "nt" else ""
BAT = ".bat" if os.name == "nt" else ""


def sdk_root():
    for k in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if os.environ.get(k) and pathlib.Path(os.environ[k]).exists():
            return pathlib.Path(os.environ[k])
    p = pathlib.Path(os.environ.get("LOCALAPPDATA", str(pathlib.Path.home()))) / "Android" / "Sdk"
    if p.exists():
        return p
    raise SystemExit("Android SDK not found: set ANDROID_HOME")


def java_bin(name):
    jh = os.environ.get("JAVA_HOME")
    if jh and (pathlib.Path(jh) / "bin" / (name + EXE)).exists():
        return str(pathlib.Path(jh) / "bin" / (name + EXE))
    if os.name == "nt":
        for d in sorted(pathlib.Path(r"C:\Program Files\Microsoft").glob("jdk-17*"), reverse=True):
            if (d / "bin" / (name + EXE)).exists():
                return str(d / "bin" / (name + EXE))
    found = shutil.which(name)
    if not found:
        raise SystemExit(name + " not found: install JDK 17 and set JAVA_HOME")
    return found


def run(cmd, **kw):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)
    if r.returncode:
        raise SystemExit("FAILED: " + " ".join(map(str, cmd[:3])) + "\n" + (r.stdout + r.stderr)[-3000:])
    return r.stdout


def icons(res):
    """Gold-on-obsidian launcher icon at every density (drawn here, so the repo carries no binary icons)."""
    from PIL import Image, ImageDraw
    for dens, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        S = px * 4
        im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse((S * .03, S * .03, S * .97, S * .97), fill=(7, 8, 11, 255), outline=(245, 200, 75, 255), width=int(S * .05))
        for i, (x, top, h, filled) in enumerate(((.30, .26, .30, True), (.40, .36, .26, False), (.60, .30, .30, True), (.70, .40, .24, False))):
            cx = S * x
            d.line((cx, S * (top - .06), cx, S * (top + h + .06)), fill=(245, 200, 75, 255), width=max(2, int(S * .018)))
            box = (cx - S * .04, S * top, cx + S * .04, S * (top + h))
            d.rectangle(box, fill=(245, 200, 75, 255) if filled else None, outline=(245, 200, 75, 255), width=max(2, int(S * .016)))
        c = S / 2
        d.polygon([(c, c - S * .07), (c + S * .07, c), (c, c + S * .07), (c - S * .07, c)], fill=(255, 240, 168, 255))
        out = res / ("mipmap-" + dens)
        out.mkdir(parents=True, exist_ok=True)
        im.resize((px, px), Image.LANCZOS).save(out / "ic_launcher.png")


def keystore(keytool):
    ks = pathlib.Path(os.environ.get("EXTERM_KEYSTORE") or (pathlib.Path(os.environ.get("LOCALAPPDATA", str(pathlib.Path.home() / ".exterm"))) / ("ExTerm" if os.name == "nt" else "") / "exterm-release.jks"))
    pw_file = ks.with_suffix(".pass")
    if os.environ.get("EXTERM_KEYSTORE_PASS"):
        pw = os.environ["EXTERM_KEYSTORE_PASS"]
    elif pw_file.exists():
        pw = pw_file.read_text(encoding="utf-8").strip()
    else:
        pw = secrets.token_urlsafe(24)
    if not ks.exists():
        ks.parent.mkdir(parents=True, exist_ok=True)
        run([keytool, "-genkeypair", "-keystore", ks, "-storepass", pw, "-keypass", pw, "-alias", "exterm", "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000", "-dname", "CN=ExTerm Labs, O=ExTerm Labs"])
        if not os.environ.get("EXTERM_KEYSTORE_PASS"):
            pw_file.write_text(pw, encoding="utf-8")
    return ks, pw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", default=None)
    ap.add_argument("--out", default=str(ROOT / "dist" / ("ExTerm-v" + VERSION_NAME + "-android.apk")))
    a = ap.parse_args()
    html = pathlib.Path(a.html) if a.html else next((p for p in (ROOT / "dist" / "exterm.min.html", ROOT / "dist" / "exterm.html") if p.exists()), None)
    if not html or not html.exists():
        raise SystemExit("run python build.py (or --harden) first")
    sdk = sdk_root()
    bt = sdk / "build-tools" / "34.0.0"
    jar = sdk / "platforms" / "android-34" / "android.jar"
    for p in (bt, jar):
        if not p.exists():
            raise SystemExit("missing " + str(p) + ": sdkmanager \"platforms;android-34\" \"build-tools;34.0.0\"")
    javac, keytool = java_bin("javac"), java_bin("keytool")
    env = dict(os.environ)
    env["JAVA_HOME"] = str(pathlib.Path(javac).parent.parent)
    env["PATH"] = str(pathlib.Path(javac).parent) + os.pathsep + env.get("PATH", "")
    with tempfile.TemporaryDirectory(prefix="exterm-apk-") as td:
        t = pathlib.Path(td)
        res = t / "res"
        shutil.copytree(ROOT / "android" / "res", res)
        icons(res)
        www = t / "assets" / "www"
        www.mkdir(parents=True)
        shutil.copy(html, www / "index.html")
        flat = t / "res.zip"
        run([bt / ("aapt2" + EXE), "compile", "--dir", res, "-o", flat])
        gen, base = t / "gen", t / "base.apk"
        gen.mkdir()
        run([bt / ("aapt2" + EXE), "link", "-I", jar, "--manifest", ROOT / "android" / "AndroidManifest.xml", "-A", t / "assets", "--java", gen,
             "--min-sdk-version", MIN_SDK, "--target-sdk-version", TARGET_SDK, "--version-code", VERSION_CODE, "--version-name", VERSION_NAME, "-o", base, flat])
        srcs = [str(p) for p in (ROOT / "android" / "src").rglob("*.java")] + [str(p) for p in gen.rglob("*.java")]
        obj = t / "obj"
        obj.mkdir()
        run([javac, "-source", "8", "-target", "8", "-nowarn", "-Xlint:-options", "-encoding", "UTF-8", "-bootclasspath", jar, "-classpath", jar, "-d", obj] + srcs, env=env)
        dex = t / "dex"
        dex.mkdir()
        run([bt / ("d8" + BAT), "--release", "--min-api", MIN_SDK, "--lib", jar, "--output", dex] + [str(p) for p in obj.rglob("*.class")], env=env)
        unsigned = t / "unsigned.apk"
        with zipfile.ZipFile(base) as zi, zipfile.ZipFile(unsigned, "w") as zo:
            for item in zi.infolist():
                zo.writestr(item, zi.read(item.filename))
            zo.write(dex / "classes.dex", "classes.dex", compress_type=zipfile.ZIP_DEFLATED)
        aligned = t / "aligned.apk"
        run([bt / ("zipalign" + EXE), "-p", "-f", "4", unsigned, aligned])
        ks, pw = keystore(keytool)
        out = pathlib.Path(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        run([bt / ("apksigner" + BAT), "sign", "--ks", ks, "--ks-key-alias", "exterm", "--ks-pass", "pass:" + pw, "--key-pass", "pass:" + pw, "--out", out, aligned], env=env)
        print(run([bt / ("apksigner" + BAT), "verify", "--print-certs", out], env=env).splitlines()[0])
        print("built " + str(out.relative_to(ROOT) if out.is_relative_to(ROOT) else out) + "  " + str(round(out.stat().st_size / 1024)) + " KB  (v" + VERSION_NAME + ", minSdk " + MIN_SDK + ", targetSdk " + TARGET_SDK + ")")


if __name__ == "__main__":
    main()
