import java.io.File
import java.time.Duration

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.secrets)
}

android {
  namespace = "com.example"
  compileSdk { version = release(37) }

  defaultConfig {
    applicationId = "org.codestep.avi"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  // Do not remove or modify these signingConfigs. They are necessary for building, installing,
  // and updating Android apps in AI Studio.
  signingConfigs {
    create("release") {
      val keystorePath = System.getenv("KEYSTORE_PATH") ?: "${rootDir}/my-upload-key.jks"
      storeFile = file(keystorePath)
      storePassword = System.getenv("STORE_PASSWORD")
      keyAlias = "upload"
      keyPassword = System.getenv("KEY_PASSWORD")
    }
    create("debugConfig") {
      val customKeystore = file("${rootDir}/debug.keystore")
      storeFile = if (customKeystore.exists()) customKeystore else signingConfigs.getByName("debug").storeFile
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      // Do not remove or modify this signingConfig assignment. It is necessary for Android apps in
      // AI Studio.
      signingConfig = signingConfigs.getByName("release")
    }
    debug {
      // Do not remove or modify this signingConfig assignment. It is necessary for Android apps in
      // AI Studio.
      signingConfig = signingConfigs.getByName("debugConfig")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions { unitTests { isIncludeAndroidResources = true } }
  sourceSets.getByName("main").assets {
    directories.add(layout.buildDirectory.dir("generated/aviMapStyles").get().asFile.path)
  }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

kotlin {
  compilerOptions {
    // Free of the pre-2.4 "-Xannotation-default-target" opt-in now that AGP ships Kotlin 2.4.
  }
}

// Configure the Secrets Gradle Plugin to use .env and .env.example files
// to match the convention used in Web projects.
secrets {
  propertiesFileName = ".env"
  defaultPropertiesFileName = ".env.example"
}

// Ship the shared Positron map styles from packages/map-style as Android assets,
// so web and Android render from the same single source of truth.
// NOTE: derived via parentFile instead of ".." — path builds with ".." are
// misresolved by the local environment's mount layer (rootProject layout .dir("..")
// produced apps/packages instead of repo/packages).
val aviRootDir = rootProject.projectDir.parentFile.parentFile
val aviMapStyleDir = File(aviRootDir, "packages/map-style")
val generatedMapAssets = layout.buildDirectory.dir("generated/aviMapStyles")
val copyAviMapStyles = tasks.register("copyAviMapStyles", Copy::class) {
  from(aviMapStyleDir) {
    include("style.json", "style-dark.json")
    into("map")
  }
  into(generatedMapAssets)
}

// Some unused dependencies are commented out below instead of being removed.
// This makes it easy to add them back in the future if needed.
dependencies {
  implementation(platform(libs.androidx.compose.bom))
  implementation(platform(libs.supabase.bom))
  // implementation(libs.accompanist.permissions)
  implementation(libs.androidx.activity.compose)
  // implementation(libs.androidx.camera.camera2)
  // implementation(libs.androidx.camera.core)
  // implementation(libs.androidx.camera.lifecycle)
  // implementation(libs.androidx.camera.view)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.compose.material.icons.extended)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.navigation.compose)
  implementation(libs.androidx.room.ktx)
  implementation(libs.androidx.room.runtime)
  implementation(libs.androidx.work.runtime.ktx)
  // implementation(libs.coil.compose)
  implementation(libs.converter.moshi)
  implementation(libs.supabase.auth)
  implementation(libs.supabase.postgrest)
  implementation(libs.supabase.realtime)
  implementation(libs.ktor.client.core)
  implementation(libs.ktor.client.okhttp)
  implementation(libs.ktor.client.content.negotiation)
  implementation(libs.ktor.serialization.kotlinx.json)
  implementation(libs.kotlinx.serialization.json)
  implementation(libs.maplibre.compose)
  implementation(libs.androidx.credentials)
  implementation(libs.androidx.credentials.play.services)
  implementation(libs.googleid)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  implementation(libs.logging.interceptor)
  implementation(libs.moshi.kotlin)
  implementation(libs.okhttp)
  implementation(libs.retrofit)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
  "kspDebug"(libs.androidx.room.compiler)
  "kspRelease"(libs.androidx.room.compiler)
  // "ksp"(libs.moshi.kotlin.codegen)
}

tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(copyAviMapStyles) }

tasks.matching { it.name.startsWith("ksp") }.configureEach {
  if (name.contains("UnitTest") || name.contains("AndroidTest")) {
    enabled = false
  }
  doFirst {
    val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      val isKspAwtTeardownNpe =
        thread.name.startsWith("AWT-EventQueue") &&
          throwable is NullPointerException &&
          throwable.stackTrace.any { it.className.startsWith("ksp.com.intellij.") }
      if (!isKspAwtTeardownNpe) {
        if (previousHandler != null) {
          previousHandler.uncaughtException(thread, throwable)
        } else {
          System.err.print("Exception in thread \"${thread.name}\" ")
          throwable.printStackTrace(System.err)
        }
      }
    }
  }
}

tasks.withType<Test> {
  failFast = true
  timeout.set(Duration.ofMinutes(2))
  testLogging {
    events("passed", "failed", "skipped")
  }
}
