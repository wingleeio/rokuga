{
  "targets": [
    {
      "target_name": "rokuga_capture",
      "sources": ["src/native/capture.mm"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "libraries": [
        "-framework ScreenCaptureKit",
        "-framework AVFoundation",
        "-framework CoreMedia",
        "-framework CoreGraphics",
        "-framework Foundation"
      ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "15.0",
        "OTHER_CFLAGS": ["-fobjc-arc"]
      }
    }
  ]
}
