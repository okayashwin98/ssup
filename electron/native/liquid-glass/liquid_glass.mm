// Puts Apple's Liquid Glass (macOS 26+) under an Electron window's web content, as
// Screen Studio's bar has. addGlass(nativeWindowHandle, cornerRadius) → true when added.
// setGlassRects(nativeWindowHandle, [{x, y, width, height, radius}]) puts glass only under
// those parts of the window (top-left points), replacing the previous ones; [] removes them.
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

static NSString* const kRectGlassId = @"supershare-glass-rect";

static bool ReadNumber(napi_env env, napi_value object, const char* name, double* out) {
	napi_value value;
	return napi_get_named_property(env, object, name, &value) == napi_ok &&
		napi_get_value_double(env, value, out) == napi_ok;
}

static napi_value SetGlassRects(napi_env env, napi_callback_info info) {
	size_t argc = 2;
	napi_value args[2];
	napi_value result;
	napi_get_boolean(env, false, &result);
	if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc < 2) return result;

	void* data = nullptr;
	size_t length = 0;
	uint32_t count = 0;
	if (napi_get_buffer_info(env, args[0], &data, &length) != napi_ok || length < sizeof(void*)) return result;
	if (napi_get_array_length(env, args[1], &count) != napi_ok) return result;

	NSView* handle = *reinterpret_cast<NSView* __unsafe_unretained*>(data);
	NSView* content = handle.window.contentView ?: handle;
	if (!content) return result;

	if (@available(macOS 26.0, *)) {
		for (NSView* view in [content.subviews copy]) {
			if ([view.identifier isEqualToString:kRectGlassId]) [view removeFromSuperview];
		}
		const CGFloat height = content.bounds.size.height;
		for (uint32_t i = 0; i < count; i++) {
			napi_value item;
			double x = 0, y = 0, w = 0, h = 0, radius = 0;
			if (napi_get_element(env, args[1], i, &item) != napi_ok) continue;
			if (!ReadNumber(env, item, "x", &x) || !ReadNumber(env, item, "y", &y) ||
				!ReadNumber(env, item, "width", &w) || !ReadNumber(env, item, "height", &h))
				continue;
			ReadNumber(env, item, "radius", &radius);
			if (w <= 0 || h <= 0) continue;
			// AppKit counts up from the bottom unless the view says otherwise.
			const CGFloat top = content.isFlipped ? y : height - y - h;
			NSGlassEffectView* glass = [[NSGlassEffectView alloc] initWithFrame:NSMakeRect(x, top, w, h)];
			glass.identifier = kRectGlassId;
			glass.cornerRadius = radius;
			glass.style = NSGlassEffectViewStyleRegular;
			[content addSubview:glass positioned:NSWindowBelow relativeTo:nil];
		}
		napi_get_boolean(env, true, &result);
	}
	return result;
}

static napi_value Init(napi_env env, napi_value exports) {
	napi_value fn;
	napi_create_function(env, "addGlass", NAPI_AUTO_LENGTH, AddGlass, nullptr, &fn);
	napi_set_named_property(env, exports, "addGlass", fn);
	napi_create_function(env, "setGlassRects", NAPI_AUTO_LENGTH, SetGlassRects, nullptr, &fn);
	napi_set_named_property(env, exports, "setGlassRects", fn);
	return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
