plugins {
    id("com.android.application")
}

android {
    namespace = "com.viperquiz.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.viperquiz.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "START_URL", "\"https://viperquiz-nrvaosi4.manus.space/\"")
    }

    buildFeatures {
        buildConfig = true
    }
}