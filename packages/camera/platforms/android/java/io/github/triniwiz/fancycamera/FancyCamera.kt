/*
 * Created By Osei Fortune on 2/16/18 8:43 PM
 * Copyright (c) 2018
 * Last modified 2/16/18 7:58 PM
 *
 */

package io.github.triniwiz.fancycamera

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaRecorder
import android.os.Build
import android.util.AttributeSet
import android.util.SparseIntArray
import android.view.Surface
import android.widget.FrameLayout

@SuppressLint("RestrictedApi")
class FancyCamera : FrameLayout {
  private val VIDEO_RECORDER_PERMISSIONS_REQUEST = 868
  private val VIDEO_RECORDER_PERMISSIONS =
    arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
  private var mFlashEnabled = false
  private val mLock = Any()
  private var listener: CameraEventListener? = null
  private var isRecording = false
  private var recorder: MediaRecorder? = null
  private var isGettingAudioLvls = false
  private var mEMA = 0.0
  private lateinit var cameraView: CameraBase

  var enableAudio: Boolean
    get() {
      return cameraView.enableAudio
    }
    set(value) {
      cameraView.enableAudio = value
    }

  var enablePinchZoom: Boolean
    get() {
      return cameraView.enablePinchZoom
    }
    set(value) {
      cameraView.enablePinchZoom = value
    }

  var enableTapToFocus: Boolean
    get() {
      return cameraView.enableTapToFocus
    }
    set(value) {
      cameraView.enableTapToFocus = value
    }

  var retrieveLatestImage: Boolean
    get() {
      return cameraView.retrieveLatestImage
    }
    set(value) {
      cameraView.retrieveLatestImage = value
    }

  val latestImage: Bitmap?
    get() {
      return cameraView.latestImage
    }

  var pause: Boolean
    get() {
      return cameraView.pause
    }
    set(value) {
      cameraView.pause = value
    }

  var zoom: Float
    get() {
      return cameraView.zoom
    }
    set(value) {
      cameraView.zoom = value
    }

  var whiteBalance: WhiteBalance
    get() {
      return cameraView.whiteBalance
    }
    set(value) {
      cameraView.whiteBalance = value
    }

  var ratio: String
    get() {
      return cameraView.displayRatio
    }
    set(value) {
      cameraView.displayRatio = value
    }
  var pictureSize: String
    get() {
      return cameraView.pictureSize
    }
    set(value) {
      cameraView.pictureSize = value
    }
  val duration: Long
    get() {
      return cameraView.duration
    }
  val numberOfCameras: Int
    get() {
      return cameraView.numberOfCameras
    }

  val hasFlash: Boolean
    get() {
      return cameraView.hasFlash()
    }

  val cameraRecording: Boolean
    get() {
      return cameraView.cameraRecording()
    }

  var flashMode: CameraFlashMode
    get() {
      return cameraView.flashMode
    }
    set(value) {
      cameraView.flashMode = value
    }

  var allowExifRotation: Boolean
    get() {
      return cameraView.allowExifRotation
    }
    set(value) {
      cameraView.allowExifRotation = value
    }

  var autoSquareCrop: Boolean = false
    get() {
      return cameraView.autoSquareCrop
    }
    set(value) {
      field = value
      cameraView.autoSquareCrop = value
    }

  var autoFocus: Boolean = false
    get() {
      return cameraView.autoFocus
    }
    set(value) {
      field = value
      cameraView.autoFocus = value
    }

  var doubleTapCameraSwitch: Boolean = true
    get() {
      return cameraView.doubleTapCameraSwitch
    }
    set(value) {
      field = value
      cameraView.doubleTapCameraSwitch = value
    }

  var debug: Boolean = false
    get() {
      return cameraView.debug
    }
    set(value) {
      field = value
      cameraView.debug = value
    }

  var saveToGallery: Boolean = false
    get() {
      return cameraView.saveToGallery
    }
    set(value) {
      field = value
      cameraView.saveToGallery = value
    }

  var position: CameraPosition
    get() {
      return cameraView.position
    }
    set(value) {
      cameraView.position = value
    }

  var enableVideo: Boolean = false
    get() {
      return cameraView.enableVideo
    }
    set(value) {
      field = value
      cameraView.enableVideo = value
    }

  // TODO(Find a purpose for this property, which is not being used, or remove it)
  var cameraOrientation: CameraOrientation
    get() {
      return cameraView.rotation
    }
    set(orientation) {
      cameraView.rotation = orientation
    }

  var maxAudioBitRate: Int = -1

  var maxVideoBitrate: Int = -1

  var maxVideoFrameRate: Int = -1

  val db: Double
    get() {
      return cameraView.db
    }

  var processEveryNthFrame: Int
    get() {
      return cameraView.processEveryNthFrame
    }
    set(value) {
      cameraView.processEveryNthFrame = value
    }

  constructor(context: Context) : super(context) {
    init(context, null)
  }

  constructor(context: Context, attrs: AttributeSet) : super(context, attrs) {
    init(context, attrs)
  }

  val previewView: Any
    get() {
      return cameraView.previewSurface
    }

  private fun init(
    context: Context,
    attrs: AttributeSet?,
  ) {
    if (Build.VERSION.SDK_INT < 21) {
      throw Exception("This camera plugin is only supported on API 21+")
    }
    cameraView = Camera2(context, attrs)
    addView(cameraView)
  }

  var overridePhotoWidth: Int
    set(value) {
      cameraView.overridePhotoWidth = value
    }
    get() {
      return cameraView.overridePhotoWidth
    }
  var overridePhotoHeight: Int
    set(value) {
      cameraView.overridePhotoHeight = value
    }
    get() {
      return cameraView.overridePhotoHeight
    }

  fun takePhoto() {
    cameraView.takePhoto()
  }

  var videoQuality: Quality
    get() {
      return cameraView.videoQuality
    }
    set(value) {
      cameraView.videoQuality = value
    }

  var quality: Int
    get() {
      return cameraView.quality
    }
    set(value) {
      cameraView.quality = value
    }

  fun setListener(listener: CameraEventListener) {
    this.listener = listener
    cameraView.listener = listener
  }

  fun startPreview() {
    cameraView.startPreview()
  }

  fun stopPreview() {
    cameraView.stopPreview()
  }

  fun stopRecording() {
    cameraView.stopRecording()
  }

  fun startRecording() {
    cameraView.startRecording()
  }

  fun updateMode() {
    cameraView.updateMode()
  }

  fun setPhotoMode() {
    cameraView.setPhotoMode()
  }

  fun setVideoMode() {
    cameraView.setVideoMode()
  }

  // private var isForceStopping: Boolean = false

  var isAudioLevelsEnabled: Boolean
    get() {
      return cameraView.isAudioLevelsEnabled
    }
    set(value) {
      cameraView.isAudioLevelsEnabled = value
    }

  fun stop() {
    cameraView.stop()
  }

  fun release() {
    cameraView.release()
  }

  fun hasStoragePermission(): Boolean {
    return cameraView.hasStoragePermission()
  }

  fun requestStoragePermission() {
    cameraView.requestStoragePermission()
  }

  fun requestCameraPermission() {
    cameraView.requestCameraPermission()
  }

  fun requestAudioPermission() {
    cameraView.requestAudioPermission()
  }

  fun requestPermission() {
    cameraView.requestPermission()
  }

  fun hasPermission(): Boolean {
    return cameraView.hasPermission()
  }

  fun hasCameraPermission(): Boolean {
    return cameraView.hasCameraPermission()
  }

  fun hasAudioPermission(): Boolean {
    return cameraView.hasAudioPermission()
  }

  fun toggleCamera() {
    cameraView.toggleCamera()
  }

  fun toggleFlash() {
    cameraView.toggleFlash()
  }

  fun setEnableAudioLevels(enableAudioLevels: Boolean) {
    cameraView.isAudioLevelsEnabled = enableAudioLevels
  }

  fun onPermissionHandler(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray,
  ) {
    if (hasCameraPermission()) {
      startPreview()
    }
  }

  fun getAvailablePictureSizes(ratio: String): Array<Size> {
    return cameraView.getAvailablePictureSizes(ratio)
  }

  companion object {
    @JvmStatic var forceV1 = false

    private val TAG = "FancyCamera"
    private val SENSOR_ORIENTATION_DEFAULT_DEGREES = 90
    private val SENSOR_ORIENTATION_INVERSE_DEGREES = 270
    private val DEFAULT_ORIENTATIONS = SparseIntArray()
    private val INVERSE_ORIENTATIONS = SparseIntArray()

    init {
      DEFAULT_ORIENTATIONS.append(Surface.ROTATION_0, 90)
      DEFAULT_ORIENTATIONS.append(Surface.ROTATION_90, 0)
      DEFAULT_ORIENTATIONS.append(Surface.ROTATION_180, 270)
      DEFAULT_ORIENTATIONS.append(Surface.ROTATION_270, 180)
    }

    init {
      INVERSE_ORIENTATIONS.append(Surface.ROTATION_0, 270)
      INVERSE_ORIENTATIONS.append(Surface.ROTATION_90, 180)
      INVERSE_ORIENTATIONS.append(Surface.ROTATION_180, 90)
      INVERSE_ORIENTATIONS.append(Surface.ROTATION_270, 0)
    }
  }
}
