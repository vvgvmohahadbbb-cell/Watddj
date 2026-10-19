plugins { id("com.android.application") }
android {
    namespace = "com.hamsa.app"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.hamsa.app"
        minSdk = 29
        targetSdk = 34
        versionCode = (project.findProperty("vCode") as String?)?.toInt() ?: 1
        versionName = "1.$versionCode"
    }
    signingConfigs {
        create("rel") {
            storeFile = file("../hamsa.jks"); storePassword = "hamsa123"
            keyAlias = "hamsa"; keyPassword = "hamsa123"
        }
    }
    buildTypes { release { signingConfig = signingConfigs.getByName("rel"); isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging")
}
// الإشعارات تعمل فقط إذا وُضع الملف app/google-services.json
if (file("google-services.json").exists()) { apply(plugin = "com.google.gms.google-services") }
