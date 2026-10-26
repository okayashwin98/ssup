// Puts Apple's Liquid Glass (macOS 26+) under an Electron window's web content, as
// Screen Studio's bar has. addGlass(nativeWindowHandle, cornerRadius) → true when added.
#import <AppKit/AppKit.h>
#include <node_api.h>

static napi_value AddGlass(napi_env env, napi_callback_info info) {
	size_t argc = 2;
	napi_value args[2];
	napi_value result;
	napi_get_boolean(env, false, &result);
	if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc < 2) return result;

	void* data = nullptr;
	size_t length = 0;
	double radius = 0;
	if (napi_get_buffer_info(env, args[0], &data, &length) != napi_ok || length < sizeof(void*)) return result;
	if (napi_get_value_double(env, args[1], &radius) != napi_ok) return result;

	// Electron's handle is the window's content view.
	NSView* handle = *reinterpret_cast<NSView* __unsafe_unretained*>(data);
	NSView* content = handle.window.contentView ?: handle;
	if (!content) return result;

	if (@available(macOS 26.0, *)) {
		NSGlassEffectView* glass = [[NSGlassEffectView alloc] initWithFrame:content.bounds];
		glass.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
		glass.cornerRadius = radius;
		glass.style = NSGlassEffectViewStyleRegular;
		// Under everything else in the window, the web content included.
		[content addSubview:glass positioned:NSWindowBelow relativeTo:nil];
		napi_get_boolean(env, true, &result);
	}
	return result;
}

static napi_value Init(napi_env env, napi_value exports) {
	napi_value fn;
	napi_create_function(env, "addGlass", NAPI_AUTO_LENGTH, AddGlass, nullptr, &fn);
	napi_set_named_property(env, exports, "addGlass", fn);
	return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
