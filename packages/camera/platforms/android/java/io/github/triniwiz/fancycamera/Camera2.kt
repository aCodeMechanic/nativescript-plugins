package io.github.triniwiz.fancycamera

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.content.res.Configuration
import android.graphics.*
import android.hardware.camera2.*
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.AttributeSet
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.Surface
import androidx.annotation.RequiresApi
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.camera.video.VideoCapture
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.GestureDetectorCompat
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.LifecycleOwner
import com.google.common.util.concurrent.ListenableFuture
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SuppressLint("UnsafeOptInUsageError")
@RequiresApi(Build.VERSION_CODES.LOLLIPOP)
class Camera2
  @JvmOverloads
  constructor(context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0) :
  CameraBase(context, attrs, defStyleAttr) {
    private var cameraProviderFuture: ListenableFuture<ProcessCameraProvider>
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var imageCaptureExecutor = Executors.newSingleThreadExecutor()
    private var videoCaptureExecutor = Executors.newSingleThreadExecutor()
    private var camera: androidx.camera.core.Camera? = null
    private var preview: Preview? = null
    private var surfaceRequest: SurfaceRequest? = null
    private var isStarted = false
    private var isRecording = false
    private var file: File? = null // used to store the captured photo/video in a file

    // private var isForceStopping = true
    private var mLock = Any()
    private var cameraManager: CameraManager? = null
    private var recording: Recording? = null
    private var pendingAutoFocus = false
    private var lastZoomRatio = 1.0f
    private var autoFocusTimer: Timer? = null

    private var firstTime: Boolean = true
    override var enablePinchZoom: Boolean = true
    override var enableTapToFocus: Boolean = true

    override var debug: Boolean = false

    // override var enableVideo: Boolean = false
    override fun setVideoMode() {
      enableVideo = true
      displayRatio = "16:9"
      if (debug) {
        Log.d(
          "io.github.triniwiz.fancycamera",
          "setVideoMode() enableVideo set to " + enableVideo.toString(),
        )
      }
    }

    override fun setPhotoMode() {
      enableVideo = false
      displayRatio = "4:3"
      if (debug) {
        Log.d(
          "io.github.triniwiz.fancycamera",
          "setPhotoMode() enableVideo set to " + enableVideo.toString(),
        )
      }
    }

    override var enableVideo: Boolean = false
      get() {
        if (debug) {
          Log.d(
            "io.github.triniwiz.fancycamera",
            "enableVideo get " + field.toString(),
          )
        }
        return field
      }
      set(value) {
        if (debug) {
          Log.d(
            "io.github.triniwiz.fancycamera",
            "enableVideo set " + value.toString(),
          )
        }
        field = value
        // cameraView.enableVideo = value
      }
    // override var enableVideo: Boolean = false
    //   set(value) {
    //     if (value != field) {
    //       field = value
    //       if (value) {
    //         Log.d(
    //           "io.github.triniwiz.fancycamera",
    //           "Changing to video ratio 16:9",
    //         )
    //         displayRatio = "16:9"
    //       } else {

    //         Log.d(
    //           "io.github.triniwiz.fancycamera",
    //           "Changing to photo ratio 4:3",
    //         )
    //         displayRatio = "4:3"
    //       }
    //     } else {
    //       Log.d(
    //         "io.github.triniwiz.fancycamera",
    //         "same value for enableVideo, ignoring",
    //       )
    //     }
    //   }

    override fun updateMode() {
      if (debug) {
        Log.d(
          "io.github.triniwiz.fancycamera",
          "updateMode()",
        )
      }
      if (isStarted) {
        safeUnbindAll()
        refreshCamera()
      }
    }

    override var retrieveLatestImage: Boolean = false
      set(value) {
        field = value
        if (!value && latestImage != null) {
          latestImage = null
        }
      }

    override var pause: Boolean = false
      set(value) {
        field = value
        if (value) {
          stopPreview()
        } else {
          startPreview()
        }
      }

    private fun handleZoom() {
      // here we set the zoom once
      // handles the case where: user changes the zoom before camera is ready, apply it when
      // camera ready
      // user changes zoom after camera is ready, this will trigger on the zoom setter
      camera?.cameraControl?.let {
        var zoomChanged = true
        if (storedZoom > 0) {
          it.setLinearZoom(storedZoom)
          storedZoom = -1f
        } else if (storedZoomRatio > 0) {
          it.setZoomRatio(storedZoomRatio)
          storedZoomRatio = -1f
        } else {
          zoomChanged = false
        }
        if (zoomChanged) {
          onZoomChange()
        }
      }
    }

    override val previewSurface: Any
      get() {
        return previewView
      }
    val maxZoomRatio: Float
      get() = camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f
    val minZoomRatio: Float
      get() = camera?.cameraInfo?.zoomState?.value?.minZoomRatio ?: 1f
    var storedZoomRatio: Float = -1F
    override var zoomRatio: Float
      get() = camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1f
      set(value) {
        storedZoomRatio = value
        storedZoom = -1f
        handleZoom()
      }

    var storedZoom: Float = -1.0F

    override var zoom: Float
      get() =
        camera?.cameraInfo?.zoomState?.value?.linearZoom
          ?: (if (storedZoom < 0) 0.0f else storedZoom)
      set(value) {
        storedZoom =
          when {
            value > 1 -> {
              1f
            }
            value < 0 -> {
              0f
            }
            else -> {
              value
            }
          }
        storedZoomRatio = -1f
        handleZoom()
      }
    override var whiteBalance: WhiteBalance = WhiteBalance.Auto
      set(value) {
        if (!isRecording) {
          field = value
          safeUnbindAll()
          refreshCamera()
        }
      }
    override var displayRatio = "4:3"
      set(value) {
        if (value == field) return
        field =
          when (value) {
            "16:9" -> {
              value
            }
            "4:3" -> value
            else -> return
          }
      }
    override var pictureSize: String = "0x0"
      get() {
        if (field == "0x0") {
          val size = cachedPictureRatioSizeMap[displayRatio]?.get(0)
          if (size != null) {
            return when (resources.configuration.orientation) {
              Configuration.ORIENTATION_LANDSCAPE -> "${size.width}x${size.height}"
              Configuration.ORIENTATION_PORTRAIT -> "${size.height}x${size.width}"
              else -> field
            }
          }
        }
        return field
      }
      set(value) {
        val size = stringSizeToSize(value)
        if (cachedPictureRatioSizeMap[displayRatio]?.contains(size) == true) {
          field = value
        }
      }

    private var previewView: PreviewView = PreviewView(context, attrs, defStyleAttr)

    private fun getFocusMeteringActions(): Int {
      var actions = FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE
      if (whiteBalance == WhiteBalance.Auto) {
        actions = actions or FocusMeteringAction.FLAG_AWB
      }
      return actions
    }

    private fun cancelAndDisposeFocusTimer() {
      autoFocusTimer?.cancel()
      autoFocusTimer?.purge()
      autoFocusTimer = null
    }

    private fun setupGestureListeners() {
      val listener =
        object :
          ScaleGestureDetector.SimpleOnScaleGestureListener(),
          GestureDetector.OnGestureListener,
          GestureDetector.OnDoubleTapListener {
          override fun onScale(detector: ScaleGestureDetector): Boolean {
            camera?.cameraInfo?.zoomState?.value?.let { zoomState ->
              camera?.cameraControl?.setZoomRatio(
                detector.scaleFactor * zoomState.zoomRatio,
              )
              onZoomChange()
            }
            return true
          }

          override fun onDown(p0: MotionEvent): Boolean = false

          override fun onShowPress(p0: MotionEvent) = Unit

          override fun onSingleTapUp(event: MotionEvent): Boolean {
            // Log.d( "io.github.triniwiz.fancycamera","onSingleTapUp")
            val factory: MeteringPointFactory = previewView.meteringPointFactory
            val autoFocusPoint = factory.createPoint(event.x, event.y)
            try {
              camera?.cameraControl?.cancelFocusAndMetering()
              camera?.cameraControl?.startFocusAndMetering(
                FocusMeteringAction.Builder(
                  autoFocusPoint,
                  getFocusMeteringActions(),
                )
                  .apply {
                    // focus only when the user tap the preview
                    disableAutoCancel()
                  }
                  .build(),
              )
              cancelAndDisposeFocusTimer()
              autoFocusTimer = Timer("autoFocusTimer")
              autoFocusTimer?.schedule(
                object : TimerTask() {
                  override fun run() {
                    handleAutoFocus()
                  }
                },
                5000,
              )
            } catch (e: CameraInfoUnavailableException) {
              if (debug) {
                Log.d(
                  "io.github.triniwiz.fancycamera",
                  "ERROR! cannot access camera",
                  e,
                )
              }
              listener?.onCameraError("setupGestureListeners() Error", e)
            }
            return true
          }

          override fun onDoubleTap(event: MotionEvent): Boolean {
            // Log.d( "io.github.triniwiz.fancycamera","onDoubleTap")
            if (doubleTapCameraSwitch) {
              toggleCamera()
              // Log.d( "io.github.triniwiz.fancycamera","toggling Camera")
            }
            // else Log.d( "io.github.triniwiz.fancycamera","flag disabled, ignoring")
            return true
          }

          override fun onDoubleTapEvent(event: MotionEvent): Boolean {
            // Log.d( "io.github.triniwiz.fancycamera","onDoubleTapEvent")
            return true
          }

          override fun onScroll(
            p0: MotionEvent?,
            p1: MotionEvent,
            p2: Float,
            p3: Float,
          ) = false

          override fun onFling(
            p0: MotionEvent?,
            p1: MotionEvent,
            p2: Float,
            p3: Float,
          ) = false

          override fun onLongPress(p0: MotionEvent) = Unit

          override fun onSingleTapConfirmed(p0: MotionEvent) = false
        }
      val scaleGestureDetector = ScaleGestureDetector(context, listener)
      val gestureDetectorCompat = GestureDetectorCompat(context, listener)
      previewView.setOnTouchListener { view, event ->
        if (enablePinchZoom) scaleGestureDetector.onTouchEvent(event)
        if (enableTapToFocus) gestureDetectorCompat.onTouchEvent(event)
        view.performClick()
        true
      }
    }

    init {
      setupGestureListeners()
      previewView.afterMeasured { handleAutoFocus() }
      addView(previewView)

      // TODO: Bind this to the view's onCreate method
      cameraProviderFuture = ProcessCameraProvider.getInstance(context)
      cameraProviderFuture.addListener(
        {
          try {
            cameraProvider?.unbindAll()
            cameraProvider = cameraProviderFuture.get()
            refreshCamera() // or just initPreview() ?
          } catch (e: Exception) {
            listener?.onCameraError("Failed to get camera", e)
            isStarted = false
          }
        },
        ContextCompat.getMainExecutor(context),
      )
      if (enableVideo) {
        if (debug) {
          Log.d(
            "io.github.triniwiz.fancycamera",
            "init, enableVideo is TRUE",
          )
        }
      } else {
        if (enableVideo) {
          if (debug) {
            Log.d(
              "io.github.triniwiz.fancycamera",
              "init, enableVideo is FALSE",
            )
          }
        }
      }
    }

    private fun handleAutoFocus() {
      if (camera?.cameraControl == null) {
        pendingAutoFocus = true
        return
      }
      pendingAutoFocus = false
      if (autoFocus) {
        val factory: MeteringPointFactory =
          SurfaceOrientedMeteringPointFactory(
            previewView.width.toFloat(),
            previewView.height.toFloat(),
          )
        val centerWidth = previewView.width.toFloat() / 2
        val centerHeight = previewView.height.toFloat() / 2
        val autoFocusPoint = factory.createPoint(centerWidth, centerHeight)
        try {
          val action =
            FocusMeteringAction.Builder(autoFocusPoint, getFocusMeteringActions())
              .apply { setAutoCancelDuration(2, TimeUnit.SECONDS) }
              .build()
          val supported = camera?.cameraInfo?.isFocusMeteringSupported(action)
          camera?.cameraControl?.startFocusAndMetering(action)
        } catch (e: CameraInfoUnavailableException) {
          listener?.onCameraError("handleAutoFocus() Error", e)
        }
      }
    }

    override var allowExifRotation: Boolean = false
    override var autoSquareCrop: Boolean = false
    override var autoFocus: Boolean = true
    override var doubleTapCameraSwitch: Boolean = true

    override var saveToGallery: Boolean = false
    override var quality: Int = 95
    override var maxAudioBitRate: Int = -1
    override var maxVideoBitrate: Int = -1
    override var maxVideoFrameRate: Int = -1

    override val numberOfCameras: Int
      get() {
        if (cameraManager == null) {
          cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager?
        }
        var count = 0
        try {
          count = cameraManager?.cameraIdList?.size ?: 0
        } catch (e: CameraAccessException) {
          listener?.onCameraError("handleAutoFocus() Error", e)
        }
        return count
      }

    private fun getFlashMode(): Int {
      var test = camera?.cameraInfo?.hasFlashUnit()
      return when (flashMode) {
        CameraFlashMode.AUTO -> ImageCapture.FLASH_MODE_AUTO
        CameraFlashMode.ON -> ImageCapture.FLASH_MODE_ON
        else -> ImageCapture.FLASH_MODE_OFF
      }
    }

    override var position: CameraPosition = CameraPosition.BACK

    private fun selectorFromPosition(): CameraSelector {
      // Log.d("io.github.triniwiz.fancycamera", "selectorFromPosition()")
      return CameraSelector.Builder()
        .apply {
          if (position == CameraPosition.FRONT) {
            requireLensFacing(CameraSelector.LENS_FACING_FRONT)
          } else {
            requireLensFacing(CameraSelector.LENS_FACING_BACK)
          }
        }
        .build()
    }

    /**
     * Rotation specified by client (external code) TODO: link this to the code, overriding or
     * affecting targetRotation logic
     */
    override var rotation: CameraOrientation = CameraOrientation.UNKNOWN

    @SuppressLint("RestrictedApi", "UnsafeExperimentalUsageError")
    override fun orientationUpdated() {
      val rotation =
        when (currentOrientation) {
          270 -> Surface.ROTATION_270
          180 -> Surface.ROTATION_180
          90 -> Surface.ROTATION_90
          else -> Surface.ROTATION_0
        }
      imageCapture?.targetRotation = rotation
      videoCapture?.targetRotation = rotation
    }

    private fun getDeviceRotation(): Int {
      val retrot =
        when (this.rotation) {
          CameraOrientation.PORTRAIT_UPSIDE_DOWN -> Surface.ROTATION_270
          CameraOrientation.PORTRAIT -> Surface.ROTATION_90
          CameraOrientation.LANDSCAPE_LEFT -> Surface.ROTATION_0
          CameraOrientation.LANDSCAPE_RIGHT -> Surface.ROTATION_180
          else -> -1
        }

      return retrot
    }

    private fun safeUnbindAll() {
      try {
        cameraProvider?.unbindAll()
      } catch (e: Exception) {
        listener?.onCameraError("handleAutoFocus() Error", e)
      } finally {
        if (isStarted) {
          listener?.onCameraClose()
        }
        isStarted = false
      }
    }

    override var videoQuality: Quality = Quality.MAX_720P
      set(value) {
        if (debug) {
          Log.d("io.github.triniwiz.fancycamera", "current videoQuality: " + field.value)
          Log.d("io.github.triniwiz.fancycamera", "set videoQuality: " + value.value)
        }
        if (!isRecording && field != value) {

          field = value
          videoCapture?.let {
            cameraProvider?.let {
              var wasBound = false
              if (it.isBound(videoCapture!!)) {
                wasBound = true
                it.unbind(imageCapture!!)
              }

              videoCapture = null
              initVideoCapture()

              if (wasBound) {
                if (!it.isBound(videoCapture!!)) {
                  it.bindToLifecycle(
                    context as LifecycleOwner,
                    selectorFromPosition(),
                    videoCapture!!,
                  )
                }
              }
            }
          }
        }
      }
    override var db: Double
      get() {
        return 0.0
      }
      set(value) {}
    override var amplitude: Double
      get() {
        return 0.0
      }
      set(value) {}
    override var amplitudeEMA: Double
      get() {
        return 0.0
      }
      set(value) {}
    override var isAudioLevelsEnabled: Boolean
      get() {
        return false
      }
      set(value) {}

    private var cachedPictureRatioSizeMap: MutableMap<String, MutableList<Size>> = HashMap()
    private var cachedPreviewRatioSizeMap: MutableMap<String, MutableList<Size>> = HashMap()

    @SuppressLint("UnsafeOptInUsageError")
    private fun updateImageCapture(autoBound: Boolean = true) {
      var wasBounded = false
      if (imageCapture != null) {
        wasBounded = cameraProvider?.isBound(imageCapture!!) ?: false
        if (wasBounded) {
          cameraProvider?.unbind(imageCapture)
          imageCapture = null
        }
      }

      val builder =
        ImageCapture.Builder().apply {
          if (getDeviceRotation() > -1) {
            setTargetRotation(getDeviceRotation())
          }
          if (pictureSize == "0x0") {
            setTargetAspectRatio(
              when (displayRatio) {
                "16:9" -> AspectRatio.RATIO_16_9
                else -> AspectRatio.RATIO_4_3
              },
            )
          } else {
            try {
              setTargetResolution(android.util.Size.parseSize(pictureSize))
            } catch (e: Exception) {
              listener?.onCameraError("updateImageCapture() Error", e)
              setTargetAspectRatio(
                when (displayRatio) {
                  "16:9" -> AspectRatio.RATIO_16_9
                  else -> AspectRatio.RATIO_4_3
                },
              )
            }
          }
          setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
          setFlashMode(getFlashMode())
        }

      val extender = Camera2Interop.Extender(builder)

      when (whiteBalance) {
        WhiteBalance.Auto -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_AUTO,
          )
        }
        WhiteBalance.Sunny -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT,
          )
        }
        WhiteBalance.Cloudy -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT,
          )
        }
        WhiteBalance.Shadow -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_SHADE,
          )
        }
        WhiteBalance.Twilight -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_TWILIGHT,
          )
        }
        WhiteBalance.Fluorescent -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT,
          )
        }
        WhiteBalance.Incandescent -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT,
          )
        }
        WhiteBalance.WarmFluorescent -> {
          extender.setCaptureRequestOption(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_WARM_FLUORESCENT,
          )
        }
      }

      // handle ultra wide af mode
      if (camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1.0f < 1.0f) {
        extender.setCaptureRequestOption(
          CaptureRequest.CONTROL_AF_MODE,
          CaptureRequest.CONTROL_AF_MODE_OFF,
        )
      }

      imageCapture = builder.build()

      if (wasBounded || autoBound) {
        cameraProvider?.let { cameraProvider ->
          if (cameraProvider.isBound(imageCapture!!)) {
            cameraProvider.bindToLifecycle(
              context as LifecycleOwner,
              selectorFromPosition(),
              imageCapture!!,
              preview!!,
            )
          }
        }
      }
    }

    private fun initPreview() {
      val previewBuilder =
        Preview.Builder().apply {
          setTargetAspectRatio(
            when (displayRatio) {
              "16:9" -> AspectRatio.RATIO_16_9
              else -> AspectRatio.RATIO_4_3
            },
          )
        }
      preview =
        previewBuilder.build().also {
          it.setSurfaceProvider(this.previewView.surfaceProvider)
        }

      camera =
        cameraProvider?.bindToLifecycle(
          context as LifecycleOwner,
          selectorFromPosition(),
          preview,
        )
      if (pendingAutoFocus) {
        handleAutoFocus()
      }

      listener?.onReady()
    }

    private fun getRecorderQuality(videoQuality: Quality): androidx.camera.video.Quality {
      return when (videoQuality) {
        Quality.MAX_480P -> androidx.camera.video.Quality.SD
        Quality.MAX_720P -> androidx.camera.video.Quality.HD
        Quality.MAX_1080P -> androidx.camera.video.Quality.FHD
        Quality.MAX_2160P -> androidx.camera.video.Quality.UHD
        Quality.HIGHEST -> androidx.camera.video.Quality.HIGHEST
        Quality.LOWEST -> androidx.camera.video.Quality.LOWEST
        Quality.QVGA -> androidx.camera.video.Quality.LOWEST
      }
    }

    @SuppressLint("RestrictedApi")
    private fun initVideoCapture() {
      if (pause) {
        if (debug) {
          Log.d(
            "io.github.triniwiz.fancycamera",
            "initVideoCapture() pause set so returning early",
          )
        }
        return
      }
      if (hasCameraPermission() && hasAudioPermission()) {
        val recorder =
          Recorder.Builder()
            .setQualitySelector(
              QualitySelector.from(
                getRecorderQuality(videoQuality),
                FallbackStrategy.lowerQualityOrHigherThan(
                  androidx.camera.video.Quality.SD,
                ),
              ),
            )
            .setExecutor(videoCaptureExecutor)
            .build()

        videoCapture =
          VideoCapture.withOutput(recorder).apply {
            if (getDeviceRotation() > -1) {
              targetRotation = getDeviceRotation()
            }
          }
      } else {
        if (debug) {
          Log.d(
            "io.github.triniwiz.fancycamera",
            "initVideoCapture() ERROR! missing permissions!",
          )
        }
      }
    }

    @SuppressLint("RestrictedApi", "UnsafeOptInUsageError")
    private fun refreshCamera() {
      if (pause) {
        if (debug) {
          Log.d("io.github.triniwiz.fancycamera", "refreshCamera() pause set so returning early")
        }
        return
      }
      cancelAndDisposeFocusTimer()
      if (!hasCameraPermission()) return
      cachedPictureRatioSizeMap.clear()
      cachedPreviewRatioSizeMap.clear()

      videoCapture = null
      imageCapture = null
      camera = null
      preview?.setSurfaceProvider(null)
      preview = null

      initPreview()

      if (enableVideo) {
        if (debug) {
          Log.d("io.github.triniwiz.fancycamera", "refreshCamera() video mode enabled, initVideoCapture()")
        }
        initVideoCapture()
      }

      handleZoom()

      camera?.cameraInfo?.let {
        val streamMap =
          Camera2CameraInfo.from(it)
            .getCameraCharacteristic(
              CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP,
            )

        if (streamMap != null) {
          val sizes =
            streamMap.getOutputSizes(ImageFormat.JPEG) +
              streamMap.getOutputSizes(SurfaceTexture::class.java)
          for (size in sizes) {
            val aspect = size.width.toFloat() / size.height.toFloat()
            var key: String? = null
            val value = Size(size.width, size.height)
            when (aspect) {
              1.0F -> key = "1:1"
              in 1.2F..1.2222222F -> key = "6:5"
              in 1.3F..1.3333334F -> key = "4:3"
              in 1.77F..1.7777778F -> key = "16:9"
              1.5F -> key = "3:2"
            }

            if (key != null) {
              val list = cachedPictureRatioSizeMap[key]
              list?.let { list.add(value) }
                ?: run { cachedPictureRatioSizeMap[key] = mutableListOf(value) }
            }
          }
        }
      }

      if (!enableVideo) {
        if (debug) {
          Log.d("io.github.triniwiz.fancycamera", "refreshCamera() photo mode enabled, updateImageCapture()")
        }
        updateImageCapture(true)
      }

      if (flashMode == CameraFlashMode.TORCH && camera?.cameraInfo?.hasFlashUnit() == true) {
        camera?.cameraControl?.enableTorch(true)
      }

      isStarted = true
      resetCurrentFrame()
      listener?.onCameraOpen()
    }

    override fun startPreview() {
      if (!isStarted) {
        refreshCamera()
      }
    }

    override fun stopPreview() {
      if (isStarted) {
        safeUnbindAll()
      }
    }

    override var flashMode: CameraFlashMode = CameraFlashMode.OFF
      set(value) {
        field = value
        camera?.let {
          var test = camera?.cameraInfo?.hasFlashUnit()
          when (value) {
            CameraFlashMode.OFF -> {
              it.cameraControl.enableTorch(false)
              imageCapture?.flashMode = ImageCapture.FLASH_MODE_OFF
            }
            CameraFlashMode.ON, CameraFlashMode.RED_EYE ->
              imageCapture?.flashMode = ImageCapture.FLASH_MODE_ON
            CameraFlashMode.AUTO -> imageCapture?.flashMode = ImageCapture.FLASH_MODE_AUTO
            CameraFlashMode.TORCH -> it.cameraControl.enableTorch(true)
          }
        }
      }

    private fun onZoomChange() {
      val currentZoomRatio = camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1.0f

      if (lastZoomRatio == currentZoomRatio ||
        lastZoomRatio < 1.0f && currentZoomRatio < 1.0f ||
        lastZoomRatio >= 1.0f && currentZoomRatio >= 1.0f
      ) {
        return
      }
      lastZoomRatio = currentZoomRatio

      updateImageCapture()
      return
    }

    @SuppressLint("RestrictedApi")
    override fun startRecording() {
      if (debug) {
        Log.d("io.github.triniwiz.fancycamera", "startRecording()")
      }
      if (!hasAudioPermission() || !hasCameraPermission()) {
        if (debug) {
          Log.d(
            "io.github.triniwiz.fancycamera",
            "ERROR! Need mic and camera to start recording! Returning",
          )
        }
        listener?.onCameraError(
          "Missing camera or audio permissions",
          Exception("Missing camera or audio permissions"),
        )
        return
      }
      deInitListener()
      val df = SimpleDateFormat("yyyyMMddHHmmss", Locale.US)
      val today = Calendar.getInstance().time
      val fileName = "VID_" + df.format(today) + ".mp4"
      file =
        if (saveToGallery && hasStoragePermission()) {
          val externalDir = context.getExternalFilesDir(Environment.DIRECTORY_DCIM)
          if (externalDir == null) {
            listener?.onCameraError(
              "Cannot save video to gallery",
              Exception("Failed to create uri"),
            )
            return
          } else {
            if (!externalDir.exists()) {
              externalDir.mkdirs()
            }
            File(externalDir, fileName)
          }
        } else {
          if (debug) {
            Log.d(
              "io.github.triniwiz.fancycamera",
              "not saving to gallery, either saveToGallery not set or don't have Storage Permissions",
            )
          }
          File(context.getExternalFilesDir(null), fileName)
        }
      if (debug) {
        Log.d(
          "io.github.triniwiz.fancycamera",
          "Saving to file:" + fileName,
        )
      }
      try {
        // on some cameras, the first time we attempt this it fails due to too many bindings,
        // although subsequent attempst work.
        // the following sections do fix this, but introduces a slight delay while
        // camera/preview is refreshed
        // and rebound.
        if (firstTime) {
          safeUnbindAll()
          initPreview()
          firstTime = false
        }

        if (videoCapture == null) {
          initVideoCapture()
        }

        cameraProvider?.let {
          // if (it.isBound(imageCapture!!)) {
          //   it.unbind(imageCapture!!)
          // }

          if (!it.isBound(videoCapture!!)) {
            it.bindToLifecycle(
              context as LifecycleOwner,
              selectorFromPosition(),
              videoCapture!!,
            )
          } else {
            it.unbind(videoCapture!!)
            it.bindToLifecycle(
              context as LifecycleOwner,
              selectorFromPosition(),
              videoCapture!!,
            )
          }
        }

        val opts = FileOutputOptions.Builder(file!!).build()

        val pending =
          videoCapture?.output?.prepareRecording(context, opts)?.asPersistentRecording()

        if (enableAudio) {
          pending?.withAudioEnabled()
        }
        if (debug) {
          Log.d(
            "io.github.triniwiz.fancycamera",
            "startRecording() starting recording",
          )
        }
        recording =
          pending?.start(ContextCompat.getMainExecutor(context)) { event ->
            when (event) {
              is VideoRecordEvent.Start -> {
                if (debug) {
                  Log.d(
                    "io.github.triniwiz.fancycamera",
                    "VideoRecordEvent.Start",
                  )
                }
                isRecording = true
                if (flashMode == CameraFlashMode.ON) {
                  camera?.cameraControl?.enableTorch(true)
                }
                startDurationTimer()
                listener?.onCameraVideoStart()
              }
              is VideoRecordEvent.Finalize -> {
                if (debug) {
                  Log.d(
                    "io.github.triniwiz.fancycamera",
                    "VideoRecordEvent.Finalize",
                  )
                }
                isRecording = false
                stopDurationTimer()

                if (event.hasError()) {
                  file = null
                  val e =
                    if (event.cause != null) {
                      Exception(event.cause)
                    } else {
                      Exception()
                    }
                  listener?.onCameraError("${event.error}", e)
                  if (debug) {
                    Log.d(
                      "io.github.triniwiz.fancycamera",
                      "ERROR in startRecording() ",
                      e,
                    )
                  }
                  ContextCompat.getMainExecutor(context).execute {
                    safeUnbindAll()
                  }
                } else {
                  if (saveToGallery) {
                    try {
                      val values =
                        ContentValues().apply {
                          put(
                            MediaStore.MediaColumns
                              .DISPLAY_NAME,
                            fileName,
                          )
                          put(
                            MediaStore.Video.Media.DATE_ADDED,
                            System.currentTimeMillis(),
                          )
                          // hardcoded video/avc
                          put(
                            MediaStore.MediaColumns.MIME_TYPE,
                            "video/avc",
                          )
                          if (Build.VERSION.SDK_INT >=
                            Build.VERSION_CODES.Q
                          ) { // this one
                            put(
                              MediaStore.MediaColumns
                                .RELATIVE_PATH,
                              Environment.DIRECTORY_DCIM,
                            )
                            put(
                              MediaStore.MediaColumns
                                .IS_PENDING,
                              1,
                            )
                            put(
                              MediaStore.Video.Media
                                .DATE_TAKEN,
                              System.currentTimeMillis(),
                            )
                          }
                        }

                      val uri =
                        context.contentResolver.insert(
                          MediaStore.Video.Media
                            .EXTERNAL_CONTENT_URI,
                          values,
                        )
                      if (uri == null) {
                        listener?.onCameraError(
                          "Failed to add video to gallery",
                          Exception("Failed to create uri"),
                        )
                      } else {
                        val fos =
                          context.contentResolver.openOutputStream(
                            uri,
                          )
                        val fis = FileInputStream(file!!)
                        fos.use {
                          if (it != null) {
                            fis.copyTo(it)
                            it.flush()
                            it.close()
                            fis.close()
                          }
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ) { // this one
                          values.clear()
                          values.put(MediaStore.Video.Media.IS_PENDING, 0)
                          context.contentResolver.update(
                            uri,
                            values,
                            null,
                            null,
                          )
                        }
                      }
                    } catch (e: Exception) {
                      if (debug) {
                        Log.e(
                          "io.github.triniwiz.fancycamera",
                          "Error while saving to Device Photos",
                        )
                      }
                      listener?.onCameraError("startRecording() Error", e)
                    }
                  }
                  if (debug) {
                    Log.d(
                      "io.github.triniwiz.fancycamera",
                      "calling listener with file",
                    )
                  }
                  listener?.onCameraVideo(file)
                }
              }
            }
          }
      } catch (e: Exception) {
        listener?.onCameraError("Failed to record video.", e)
        if (debug) {
          Log.d("io.github.triniwiz.fancycamera", "ERROR in startRecording() ", e)
        }
        isRecording = false
        stopDurationTimer()
        if (file != null) {
          file!!.delete()
        }
        cameraProvider?.let {
          if (it.isBound(videoCapture!!)) {
            it.unbind(videoCapture!!)
          }
          if (it.isBound(imageCapture!!)) {
            it.unbind(imageCapture!!)
          }
        }
        // isForceStopping = false
      }
    }

    @SuppressLint("RestrictedApi")
    override fun stopRecording() {
      if (debug) {
        Log.d("io.github.triniwiz.fancycamera", "stopRecording() ")
      }
      try {
        if (flashMode == CameraFlashMode.ON) {
          camera?.cameraControl?.enableTorch(false)
        }
        recording?.stop()
        listener?.onCameraVideoStop()
      } catch (e: Exception) {
        if (debug) {
          Log.d("io.github.triniwiz.fancycamera", "ERROR in stopRecording() ", e)
        }
        listener?.onCameraError("stopRecording() Error", e)
      }
    }

    override fun takePhoto() {
      if (debug) {
        Log.d("io.github.triniwiz.fancycamera", "takePhoto() ")
      }
      val df = SimpleDateFormat("yyyyMMddHHmmss", Locale.US)
      val today = Calendar.getInstance().time
      val fileName = "PIC_" + df.format(today) + ".jpg"
      file =
        if (saveToGallery) { // && hasStoragePermission()

          val externalDir = context.getExternalFilesDir(Environment.DIRECTORY_DCIM)
          if (externalDir == null) {
            listener?.onCameraError(
              "Cannot save photo to gallery storage",
              Exception("Failed to get external directory"),
            )
            return
          } else {
            if (!externalDir.exists()) {
              externalDir.mkdirs()
            }
            File(externalDir, fileName)
          }
        } else {
          File(context.getExternalFilesDir(null), fileName)
        }

      cameraProvider?.let { provider ->
        videoCapture?.let { if (provider.isBound(it)) provider.unbind(it) }

        if (imageCapture == null) {
          updateImageCapture(true)
        }
        imageCapture?.let { capture ->
          if (!provider.isBound(capture)) {
            provider.bindToLifecycle(
              context as LifecycleOwner,
              selectorFromPosition(),
              capture,
              preview,
            )
          }
        }
          ?: run {
            listener?.onCameraError(
              "Cannot take photo",
              Exception("imageCapture not set"),
            )
            return
          }
      }
        ?: run {
          listener?.onCameraError(
            "Cannot take photo",
            Exception("cameraProvider not set"),
          )
          return
        }

      val useImageProxy = autoSquareCrop || !allowExifRotation

      if (useImageProxy) {
        imageCapture?.takePicture(
          imageCaptureExecutor,
          object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
              processImageProxy(image, fileName)
            }

            override fun onError(exception: ImageCaptureException) {
              listener?.onCameraError("Failed to take photo image", exception)
            }
          },
        )
      } else {
        val meta =
          ImageCapture.Metadata().apply {
            isReversedHorizontal = position == CameraPosition.FRONT
          }
        val options = ImageCapture.OutputFileOptions.Builder(file!!)
        options.setMetadata(meta)
        imageCapture?.takePicture(
          options.build(),
          imageCaptureExecutor,
          object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
              processImageFile(
                fileName,
              ) // outputFileResults.savedUri.toString() is null
            }

            override fun onError(exception: ImageCaptureException) {
              listener?.onCameraError("Failed to take photo image", exception)
            }
          },
        )
      }
    }

    private fun processImageProxy(
      image: ImageProxy,
      fileName: String,
    ) {
      var isError = false
      var outputStream: FileOutputStream? = null
      try {
        val meta =
          ImageCapture.Metadata().apply {
            isReversedHorizontal = position == CameraPosition.FRONT
          }

        val buffer = image.planes.first().buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)

        val bm = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val matrix = Matrix()

        // Registering image's required rotation, provided by Androidx ImageAnalysis
        val imageTargetRotation = image.imageInfo.rotationDegrees
        matrix.postRotate(imageTargetRotation.toFloat())

        // Flipping over the image in case it is the front camera
        if (position == CameraPosition.FRONT) matrix.postScale(-1f, 1f)

        var originalWidth = bm.width
        var originalHeight = bm.height
        var offsetWidth = 0
        var offsetHeight = 0
        if (autoSquareCrop) {
          if (debug) {
            Log.d(
              "io.github.triniwiz.fancycamera",
              "processImageProxy() autoSquareCrop set, resizing image ",
            )
          }
          if (originalWidth < originalHeight) {
            offsetHeight = (originalHeight - originalWidth) / 2
            originalHeight = originalWidth
          } else if (originalWidth > originalHeight) {
            offsetWidth = (originalWidth - originalHeight) / 2
            originalWidth = originalHeight
          } else {
            offsetHeight = originalHeight
            offsetWidth = originalWidth
          }
        }
        val rotated =
          Bitmap.createBitmap(
            bm,
            offsetWidth,
            offsetHeight,
            originalWidth,
            originalHeight,
            matrix,
            false,
          )
        outputStream = FileOutputStream(file!!, false)

        rotated.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)

        val exif = ExifInterface(file!!.absolutePath)

        val now = System.currentTimeMillis()
        val datetime = convertToExifDateTime(now)

        exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, datetime)
        exif.setAttribute(ExifInterface.TAG_DATETIME_DIGITIZED, datetime)

        try {
          val subsec = (now - convertFromExifDateTime(datetime).time).toString()
          exif.setAttribute(ExifInterface.TAG_SUBSEC_TIME_ORIGINAL, subsec)
          exif.setAttribute(ExifInterface.TAG_SUBSEC_TIME_DIGITIZED, subsec)
        } catch (_: ParseException) {
        }

        exif.rotate(image.imageInfo.rotationDegrees)
        if (meta.isReversedHorizontal) {
          exif.flipHorizontally()
        }
        if (meta.isReversedVertical) {
          exif.flipVertically()
        }
        if (meta.location != null) {
          exif.setGpsInfo(meta.location!!)
        }
        exif.saveAttributes()

        bm.recycle()
        rotated.recycle()
      } catch (e: Exception) {
        isError = true
        listener?.onCameraError("Failed to save photo.", e)
      } finally {
        try {
          outputStream?.close()
        } catch (e: IOException) {
          // NOOP
        }
        try {
          image.close()
        } catch (_: Exception) {
        }

        if (!isError) {
          if (saveToGallery) { // && hasStoragePermission()) {

            try {
              if ((Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) &&
                !hasStoragePermission()
              ) {
                requestStoragePermission()
              }
              if ((Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ||
                (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) &&
                hasStoragePermission()
              ) {
                val values =
                  ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(
                      MediaStore.Images.Media.DATE_ADDED,
                      System.currentTimeMillis(),
                    )
                    put(MediaStore.MediaColumns.MIME_TYPE, "image/*")
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ) { // this one
                      put(
                        MediaStore.MediaColumns.RELATIVE_PATH,
                        Environment.DIRECTORY_DCIM,
                      )
                      put(MediaStore.MediaColumns.IS_PENDING, 1)
                      put(
                        MediaStore.Images.Media.DATE_TAKEN,
                        System.currentTimeMillis(),
                      )
                    }
                  }

                val uri =
                  context.contentResolver.insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    values,
                  )
                if (uri == null) {
                  listener?.onCameraError(
                    "Failed to add photo to gallery",
                    Exception("Failed to create uri"),
                  )
                } else {
                  val fos = context.contentResolver.openOutputStream(uri)
                  val fis = FileInputStream(file!!)
                  fos.use {
                    if (it != null) {
                      fis.copyTo(it)
                      it.flush()
                      it.close()
                      fis.close()
                    }
                  }
                  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // this one
                    values.clear()
                    values.put(MediaStore.Images.Media.IS_PENDING, 0)
                    context.contentResolver.update(uri, values, null, null)
                  }
                }
              } else {
                if (debug) {
                  Log.e(
                    "io.github.triniwiz.fancycamera",
                    "processImageProxy() saveToGallery set, but no permissions granted! ",
                  )
                }
              }
            } catch (e: Exception) {
              if (debug) {
                Log.e(
                  "io.github.triniwiz.fancycamera",
                  "Error while saving to Device Photos",
                )
              }
              listener?.onCameraError("processImageProxy() Error", e)
            }
            listener?.onCameraPhoto(file)
          } else {
            listener?.onCameraPhoto(file)
          }
        }
      }
    }

    private fun processImageFile(fileName: String) {
      // Saving image to user gallery
      if (saveToGallery /*&& hasStoragePermission()*/) {
        val values =
          ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.DATE_ADDED, System.currentTimeMillis())

            put(MediaStore.MediaColumns.MIME_TYPE, "image/*")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // this one
              put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DCIM)
              put(MediaStore.MediaColumns.IS_PENDING, 1)
              put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis())
            }
          }

        val uri =
          context.contentResolver.insert(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            values,
          )
        if (uri == null) {
          listener?.onCameraError(
            "Failed to add photo to gallery",
            Exception("Failed to create uri"),
          )
        } else {
          val fos = context.contentResolver.openOutputStream(uri)
          val fis = FileInputStream(file!!)
          fos.use {
            if (it != null) {
              fis.copyTo(it)
              it.flush()
              it.close()
              fis.close()
            }
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // this one
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            context.contentResolver.update(uri, values, null, null)
          }
          listener?.onCameraPhoto(file)
        }
      } else {
        listener?.onCameraPhoto(file)
      }
    }

    override fun hasFlash(): Boolean {
      return camera?.cameraInfo?.hasFlashUnit() ?: false
    }

    override fun cameraRecording(): Boolean {
      return isRecording
    }

    override fun toggleCamera() {
      if (!isRecording) {
        position =
          when (position) {
            CameraPosition.BACK -> CameraPosition.FRONT
            CameraPosition.FRONT -> CameraPosition.BACK
          }
        safeUnbindAll()
        refreshCamera()
      } else {
        // special handling if we're recording currently
        try {
          // remove video from session
          cameraProvider?.unbindAll()
          // switch camera
          cancelAndDisposeFocusTimer()

          position =
            when (position) {
              CameraPosition.BACK -> CameraPosition.FRONT
              CameraPosition.FRONT -> CameraPosition.BACK
            }

          // rebind video to session
          cameraProvider?.let {
            if (!enableVideo) {
              if (it.isBound(imageCapture!!)) {
                it.unbind(imageCapture!!)
              }
            }
            if (enableVideo) {
              if (!it.isBound(videoCapture!!)) {
                it.bindToLifecycle(
                  context as LifecycleOwner,
                  selectorFromPosition(),
                  videoCapture!!,
                )
              }
            }
            if (!it.isBound(preview!!)) {
              it.bindToLifecycle(
                context as LifecycleOwner,
                selectorFromPosition(),
                preview,
              )
            }
          }
        } catch (e: Exception) {
          if (debug) {
            Log.d(
              "io.github.triniwiz.fancycamera",
              "Camera2.kt: toggleCamera() caught an error!",
            )
          }
          listener?.onCameraError("toggleCamera() Error", e)
        }
      }
      listener?.onCameraToggle()
      if (debug) {
        Log.d(
          "io.github.triniwiz.fancycamera",
          "Camera2.kt: listener?.onCameraToggle()",
        )
      }
    }

    override fun getAvailablePictureSizes(ratio: String): Array<Size> {
      return cachedPictureRatioSizeMap[ratio]?.toTypedArray() ?: arrayOf()
    }

    override fun stop() {
      if (isRecording) {
        stopRecording()
      } else {
        safeUnbindAll()
      }
    }

    override fun release() {
      cancelAndDisposeFocusTimer()

      if (isRecording) {
        stopRecording()
      }

      safeUnbindAll()

      preview?.setSurfaceProvider(null)
      preview = null
      imageCapture = null
      videoCapture = null
      camera = null

      deInitListener()
    }
  }
