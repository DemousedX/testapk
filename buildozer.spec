[app]
title = Clicker
package.name = clicker
package.domain = org.example
source.dir = .
source.include_exts = py
version = 0.1

requirements = python3,kivy

orientation = portrait
fullscreen = 0

android.api = 34
android.minapi = 21

# (не треба поки) android.permissions =
android.archs = arm64-v8a,armeabi-v7a

[buildozer]
log_level = 2
warn_on_root = 1
