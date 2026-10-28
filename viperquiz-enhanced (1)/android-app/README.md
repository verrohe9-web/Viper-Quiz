# ViperQuiz Android

This Android WebView app opens the hosted ViperQuiz site and supports downloading APK files from it.

## Build a debug APK

Install JDK 17 or newer, the Android SDK platform 35, and Android build tools. Then run:

```sh
./gradlew :app:assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../client/public/downloads/viperquiz.apk
```

The APK is unsigned for Play Store release but is installable by sideloading. Use a release signing key and `assembleRelease` for distribution through Google Play.