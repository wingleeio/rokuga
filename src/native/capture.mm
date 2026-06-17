// In-process ScreenCaptureKit recorder. Runs inside the Electron main process,
// so it uses the app's own Screen Recording permission. Records a window or
// display to a .mov with the OS cursor excluded (showsCursor = NO).
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#include <napi.h>
#include <string>

API_AVAILABLE(macos(15.0))
@interface RKDelegate : NSObject <SCStreamDelegate, SCRecordingOutputDelegate, SCStreamOutput>
@end
@implementation RKDelegate
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {}
- (void)recordingOutput:(SCRecordingOutput *)recordingOutput didFailWithError:(NSError *)error {}
- (void)recordingOutputDidStartRecording:(SCRecordingOutput *)recordingOutput {}
- (void)recordingOutputDidFinishRecording:(SCRecordingOutput *)recordingOutput {}
// Warm-up sink: keeps the capture pipeline pulling (and discarding) frames
// before we attach the recording output, so the first recorded frame isn't
// ScreenCaptureKit's blank warm-up frame (which shows black where the window
// content hasn't composited yet).
- (void)stream:(SCStream *)stream
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
                   ofType:(SCStreamOutputType)type {}
@end

static SCStream *gStream = nil;
static RKDelegate *gDelegate = nil;
static dispatch_queue_t gWarmupQueue = nil;

// ---- start() ----
class StartWorker : public Napi::AsyncWorker {
 public:
  StartWorker(Napi::Env env, uint32_t windowId, uint32_t displayId, std::string outPath,
              int fps, Napi::Promise::Deferred def)
      : Napi::AsyncWorker(env),
        windowId_(windowId),
        displayId_(displayId),
        outPath_(outPath),
        fps_(fps),
        deferred_(def) {}

  void Execute() override {
    if (@available(macOS 15.0, *)) {
      @autoreleasepool {
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        __block bool ok = false;
        __block int w = 0, h = 0;
        __block NSString *errMsg = nil;
        uint32_t windowId = windowId_, displayId = displayId_, fps = (uint32_t)fps_;
        NSString *outPath = [NSString stringWithUTF8String:outPath_.c_str()];

        [SCShareableContent
            getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *err) {
              if (err) {
                errMsg = err.localizedDescription;
                dispatch_semaphore_signal(sem);
                return;
              }
              SCContentFilter *filter = nil;
              if (windowId != 0) {
                SCWindow *win = nil;
                for (SCWindow *ww in content.windows)
                  if (ww.windowID == windowId) { win = ww; break; }
                if (!win) { errMsg = @"window-not-found"; dispatch_semaphore_signal(sem); return; }
                filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:win];
              } else {
                SCDisplay *disp = nil;
                for (SCDisplay *dd in content.displays)
                  if (dd.displayID == displayId) { disp = dd; break; }
                if (!disp) { errMsg = @"display-not-found"; dispatch_semaphore_signal(sem); return; }
                filter = [[SCContentFilter alloc] initWithDisplay:disp excludingWindows:@[]];
              }
              SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
              config.showsCursor = NO;
              config.minimumFrameInterval = CMTimeMake(1, (int32_t)fps);
              config.capturesAudio = NO;
              CGFloat scale = filter.pointPixelScale;
              w = (int)(filter.contentRect.size.width * scale);
              h = (int)(filter.contentRect.size.height * scale);
              config.width = (size_t)w;
              config.height = (size_t)h;

              if (!gDelegate) gDelegate = [[RKDelegate alloc] init];
              if (!gWarmupQueue)
                gWarmupQueue = dispatch_queue_create("studio.rokuga.warmup", DISPATCH_QUEUE_SERIAL);
              SCStream *stream = [[SCStream alloc] initWithFilter:filter
                                                    configuration:config
                                                         delegate:gDelegate];

              // Attach a no-op screen output so the capture pipeline actually
              // runs (and discards) frames during warm-up. Without any output,
              // SCK won't pull frames, and the first recorded frame would still
              // be the blank/black cold frame.
              NSError *soErr = nil;
              [stream addStreamOutput:gDelegate
                                 type:SCStreamOutputTypeScreen
                   sampleHandlerQueue:gWarmupQueue
                                error:&soErr];

              // Build the recording output but DON'T attach it yet.
              SCRecordingOutputConfiguration *rc = [[SCRecordingOutputConfiguration alloc] init];
              rc.outputURL = [NSURL fileURLWithPath:outPath];
              rc.outputFileType = AVFileTypeQuickTimeMovie;
              SCRecordingOutput *rec = [[SCRecordingOutput alloc] initWithConfiguration:rc
                                                                               delegate:gDelegate];

              [stream startCaptureWithCompletionHandler:^(NSError *e2) {
                if (e2) {
                  errMsg = e2.localizedDescription;
                  dispatch_semaphore_signal(sem);
                  return;
                }
                // Let real frames flow for a moment, then start recording from a
                // warm (non-black) frame. start() resolves only after this, so
                // the JS cursor track stays aligned with the recording's t=0.
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.30 * NSEC_PER_SEC)),
                               dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
                                 NSError *addErr = nil;
                                 [stream addRecordingOutput:rec error:&addErr];
                                 if (addErr) {
                                   errMsg = addErr.localizedDescription;
                                 } else {
                                   ok = true;
                                   gStream = stream;
                                 }
                                 dispatch_semaphore_signal(sem);
                               });
              }];
            }];

        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(12 * NSEC_PER_SEC)));
        ok_ = ok;
        w_ = w;
        h_ = h;
        if (errMsg) err_ = std::string([errMsg UTF8String]);
      }
    } else {
      err_ = "unsupported-macos";
    }
  }

  void OnOK() override {
    Napi::Env env = Env();
    if (ok_) {
      Napi::Object o = Napi::Object::New(env);
      o.Set("width", w_);
      o.Set("height", h_);
      deferred_.Resolve(o);
    } else {
      deferred_.Reject(Napi::String::New(env, err_.empty() ? "start-failed" : err_));
    }
  }
  void OnError(const Napi::Error &e) override { deferred_.Reject(e.Value()); }

 private:
  uint32_t windowId_, displayId_;
  std::string outPath_;
  int fps_;
  Napi::Promise::Deferred deferred_;
  bool ok_ = false;
  int w_ = 0, h_ = 0;
  std::string err_;
};

Napi::Value Start(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
  uint32_t displayId = info[1].As<Napi::Number>().Uint32Value();
  std::string outPath = info[2].As<Napi::String>().Utf8Value();
  int fps = info[3].As<Napi::Number>().Int32Value();
  auto def = Napi::Promise::Deferred::New(env);
  (new StartWorker(env, windowId, displayId, outPath, fps, def))->Queue();
  return def.Promise();
}

// ---- stop() ----
class StopWorker : public Napi::AsyncWorker {
 public:
  StopWorker(Napi::Env env, Napi::Promise::Deferred def)
      : Napi::AsyncWorker(env), deferred_(def) {}

  void Execute() override {
    if (@available(macOS 15.0, *)) {
      @autoreleasepool {
        if (!gStream) return;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        [gStream stopCaptureWithCompletionHandler:^(NSError *e) { dispatch_semaphore_signal(sem); }];
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(12 * NSEC_PER_SEC)));
        gStream = nil;
      }
    }
  }
  void OnOK() override { deferred_.Resolve(Env().Undefined()); }

 private:
  Napi::Promise::Deferred deferred_;
};

Napi::Value Stop(const Napi::CallbackInfo &info) {
  auto def = Napi::Promise::Deferred::New(info.Env());
  (new StopWorker(info.Env(), def))->Queue();
  return def.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}

NODE_API_MODULE(rokuga_capture, Init)
