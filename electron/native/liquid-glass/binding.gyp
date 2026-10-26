{
  "targets": [
    {
      "target_name": "recordly_liquid_glass",
      "sources": ["liquid_glass.mm"],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "14.0",
        "OTHER_LDFLAGS": ["-framework AppKit"]
      }
    }
  ]
}
