/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/**********************************************************************************
  2017, nStudio, LLC & LiveShopper, LLC
  2023, VoiceThread - Angel Dominguez
  2024, Angel Engineering - Angel Dominguez
 **********************************************************************************/

import { Application, Device, View, File, Utils, ImageSource, path, knownFolders } from '@nativescript/core';
import { NSCameraBase, CameraTypes, CameraVideoQuality, GetSetProperty, ICameraOptions, IVideoOptions, WhiteBalance } from './common';
export * from './common';
export { CameraVideoQuality, WhiteBalance } from './common';

/**
 * Constants
 */
const WRAP_CONTENT = -2;
const ALIGN_PARENT_TOP = 10;
const ALIGN_PARENT_BOTTOM = 12;
const ALIGN_PARENT_LEFT = 9;
const ALIGN_PARENT_RIGHT = 11;
const CENTER_HORIZONTAL = 14;
const FLASH_MODE_ON = 'on';
const FLASH_MODE_OFF = 'off';
const CAMERA_FACING_FRONT = 1; // front camera
const CAMERA_FACING_BACK = 0; // rear camera
const DEVICE_INFO_STRING = () => `device: ${Device.manufacturer} ${Device.model} on SDK: ${Device.sdkVersion}`;

export class NSCamera extends NSCameraBase {
  private _camera: io.github.triniwiz.fancycamera.FancyCamera;
  private _cameraId: number; //either CAMERA_FACING_FRONT or CAMERA_FACING_BACK

  @GetSetProperty()
  public flashOnIcon = 'ic_flash_on_white';
  @GetSetProperty()
  public flashOffIcon = 'ic_flash_off_white';
  @GetSetProperty()
  public toggleCameraIcon = 'ic_switch_camera_white';
  @GetSetProperty()
  public takePicIcon = 'ic_camera_white';
  @GetSetProperty()
  public takeVideoIcon = 'ic_video_white';
  @GetSetProperty()
  public stopVideoIcon = 'ic_video_red';
  @GetSetProperty()
  public insetButtons = false;
  @GetSetProperty()
  public insetButtonsPercent = 0.1;

  private _isRecording = false;
  public get isRecording() {
    return this._isRecording;
  }
  public set isRecording(val: boolean) {
    this._isRecording = val;
  }

  private _videoQuality: CameraVideoQuality = CameraVideoQuality.HIGHEST;
  private _enableVideo = false;
  private _nativeView: android.widget.RelativeLayout;
  private _flashBtn: android.widget.ImageButton = null; // reference to native flash button
  private _takePicBtn: android.widget.ImageButton = null; // reference to native take picture button
  private _toggleCamBtn: android.widget.ImageButton = null; // reference to native toggle camera button
  private isButtonLongPressed = false;
  private _defaultCamera: CameraTypes;
  public _lastCameraOptions: ICameraOptions[];
  // readonly _context; // can define this here to avoid TS warning if encountered, NS provides the context during lifecycle as part of ViewBase

  /**
   * Creates the NSCamera instance
   */
  constructor() {
    super();
    this._camera = null;
    this.flashOnIcon = this.flashOnIcon ? this.flashOnIcon : 'ic_flash_on_white';
    this.flashOffIcon = this.flashOffIcon ? this.flashOffIcon : 'ic_flash_off_white';
    this.toggleCameraIcon = this.toggleCameraIcon ? this.toggleCameraIcon : 'ic_switch_camera_white';
    this.takePicIcon = this.takePicIcon ? this.takePicIcon : 'ic_camera_alt_white';
    this.cameraId = this.defaultCamera === 'front' ? CAMERA_FACING_FRONT : CAMERA_FACING_BACK;
    this._onLayoutChangeListener = this._onLayoutChangeFn.bind(this);
    this._permissionListener = this._permissionListenerFn.bind(this);
    this._lastCameraOptions = [];
  }

  isVideoEnabled(): boolean {
    if (this._camera) {
      return !!this._camera.getEnableVideo();
    } else {
      return this._enableVideo;
    }
  }

  updateModeUI(): void {
    if (this.isVideoEnabled()) {
      //check permission just in case
      if (!this._camera.hasPermission()) {
        this.CLog('missing permission(s), requesting');
        this._camera.requestPermission();
        if (!this.camera.hasPermission()) {
          this.CError('not enough permission for video mode!');
          return;
        }
      }
      const takePicDrawable = getImageDrawable(this.takeVideoIcon);
      this._takePicBtn?.setImageResource(takePicDrawable); // set the icon
    } else {
      const takePicDrawable = getImageDrawable(this.takePicIcon);
      this._takePicBtn?.setImageResource(takePicDrawable); // set the icon
    }
    this._ensureCorrectFlashIcon();
  }

  //@ts-ignore
  get enableVideo(): boolean {
    if (this._camera) {
      return !!this._camera.getEnableVideo();
    }
    return !!this._enableVideo;
  }

  set enableVideo(value: boolean) {
    try {
      if (typeof value === 'string') {
        value = value === 'true';
      }
      if (this._camera) {
        if (value && !this._camera.getEnableVideo()) {
          this._camera.setVideoMode();
          this.updateModeUI();
          this._camera.updateMode();
        } else if (!value && this._camera.getEnableVideo()) {
          this._camera.setPhotoMode();
          this.updateModeUI();
          this._camera.updateMode();
        }
      } else {
        this.CLog('No camera instance yet, enableVideo preference saved for when camera is ready');
      }
      this._enableVideo = value;
    } catch (err) {
      this.CError('set enableVideo() error!', err);
    }
  }

  // @ts-ignore
  get ratio(): string {
    return this._camera ? this._camera.getRatio() : 'unknown';
  }
  set ratio(value: string) {
    if (this._camera) {
      this._camera.setRatio(value);
    }
  }

  // @ts-ignore
  get videoQuality(): CameraVideoQuality {
    return this._videoQuality;
  }
  set videoQuality(value: CameraVideoQuality) {
    this._videoQuality = value;
    if (this._camera) {
      //check if camera is ready yet, and update quality if so
      this.updateQuality();
      this.CLog('updated camera videoQuality to ', value);
    } else {
      //if camera is not ready yet, save preference in local class property for use later when recording video
      this.CLog('Video quality preference saved, will be used once recording starts. ');
    }
  }

  // @ts-ignore
  get zoom(): number {
    return this._camera ? this._camera.getZoom() : 0;
  }

  set zoom(value: number) {
    if (this._camera) {
      this._camera.setZoom(value);
    }
  }

  private _doubleTapCameraSwitch = true;
  // @ts-ignore
  get doubleTapCameraSwitch(): boolean {
    return this._camera ? this._camera.getDoubleTapCameraSwitch() : this._doubleTapCameraSwitch;
  }

  set doubleTapCameraSwitch(value: boolean) {
    if (typeof value != 'boolean') {
      value = value === 'true';
    }

    if (this._camera) {
      this._camera.setDoubleTapCameraSwitch(value);
    } else this.CLog('no camera yet, setDoubleTapCameraSwitch will be set on init');
    this._doubleTapCameraSwitch = value;
  }

  private _debug: boolean = false;
  // @ts-ignore
  get debug(): boolean {
    return this._camera ? this._camera.getDebug() : this._debug;
  }

  set debug(value: boolean) {
    if (typeof value != 'boolean') {
      value = value === 'true';
    }

    if (this._camera) {
      this._camera.setDebug(value);
    } else this.CLog('no camera yet, debug will be set on init!');
    this._debug = value;
  }

  // @ts-ignore
  get quality(): number {
    return this._camera ? this._camera.getQuality() : 95;
  }

  set quality(value: number) {
    if (this._camera) {
      this._camera.setQuality(value);
    }
  }

  // @ts-ignore
  get defaultCamera(): CameraTypes {
    return this._defaultCamera ? this._defaultCamera : 'rear';
  }

  set defaultCamera(value: CameraTypes) {
    this._defaultCamera = value;
    this.cameraId = value === 'front' ? CAMERA_FACING_FRONT : CAMERA_FACING_BACK;
  }

  /**
   *  Camera white balance setting when taking pictures or video.
   *    NOTE: this is currently not working properly, and only updates camera preview with whitebalance once
   *          photo is being taken or video recording starts.
   */
  // @ts-ignore
  set whiteBalance(value: WhiteBalance | string) {
    if (this._camera) {
      switch (value) {
        case WhiteBalance.Cloudy:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('Cloudy'));
          break;
        case WhiteBalance.Fluorescent:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('Fluorescent'));
          break;
        case WhiteBalance.Incandescent:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('Incandescent'));
          break;
        case WhiteBalance.Shadow:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('Shadow'));
          break;
        case WhiteBalance.Sunny:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('Sunny'));
          break;
        case WhiteBalance.Twilight:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('Twilight'));
          break;
        case WhiteBalance.WarmFluorescent:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('WarmFluorescent'));
          break;
        default:
          this._camera.setWhiteBalance(io.github.triniwiz.fancycamera.WhiteBalance.valueOf('Auto'));
          break;
      }
    }
  }

  get whiteBalance(): WhiteBalance | string {
    if (this._camera) {
      switch (this._camera.getWhiteBalance()) {
        case io.github.triniwiz.fancycamera.WhiteBalance.Cloudy:
          return WhiteBalance.Cloudy;
        case io.github.triniwiz.fancycamera.WhiteBalance.Fluorescent:
          return WhiteBalance.Fluorescent;
        case io.github.triniwiz.fancycamera.WhiteBalance.Incandescent:
          return WhiteBalance.Incandescent;
        case io.github.triniwiz.fancycamera.WhiteBalance.Shadow:
          return WhiteBalance.Shadow;
        case io.github.triniwiz.fancycamera.WhiteBalance.Sunny:
          return WhiteBalance.Sunny;
        case io.github.triniwiz.fancycamera.WhiteBalance.Twilight:
          return WhiteBalance.Twilight;
        case io.github.triniwiz.fancycamera.WhiteBalance.WarmFluorescent:
          return WhiteBalance.WarmFluorescent;
        default:
          return WhiteBalance.Auto;
      }
    }
    return WhiteBalance.Auto;
  }

  /* 
  These are the ratios possible from the plugin
  1.0F -> key = "1:1"
  in 1.2F..1.2222222F -> key = "6:5"
  in 1.3F..1.3333334F -> key = "4:3"
  in 1.77F..1.7777778F -> key = "16:9"
  1.5F -> key = "3:2"
  */
  //sizes returned are WxH, highest to lowest
  getAvailablePictureSizes(ratio: string): string[] {
    const sizes = [];
    if (this._camera && typeof ratio === 'string') {
      const nativeSizes: androidNative.Array<io.github.triniwiz.fancycamera.Size> = this._camera.getAvailablePictureSizes(ratio);
      if (!nativeSizes) return sizes;
      for (let i = 0; i < nativeSizes.length; i++) {
        let size = nativeSizes[i];
        sizes.push(`${size.getWidth()}x${size.getHeight()}`);
      }
    }
    return sizes;
  }

  get camera(): io.github.triniwiz.fancycamera.FancyCamera {
    return this._camera;
  }

  /**
   * Create the native view
   * @returns android.widget.RelativeLayout
   */
  public createNativeView(): android.widget.RelativeLayout {
    // create the Android RelativeLayout which contains the camera
    Application.android.on('activityRequestPermissions', this._permissionListener);
    this._nativeView = new android.widget.RelativeLayout(this._context);
    this._camera = new io.github.triniwiz.fancycamera.FancyCamera(this._context);
    try {
      if (!!this._enableVideo) {
        this._camera.setVideoMode();
      } else {
        this._camera.setPhotoMode();
      }
    } catch (err) {
      this.CError(err);
    }

    (this._camera as any).setLayoutParams(new android.view.ViewGroup.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT));
    this._nativeView.addView(this._camera as any);
    return this._nativeView;
  }

  private _onLayoutChangeFn(args) {
    this._initDefaultButtons();
  }

  private _onLayoutChangeListener: any;

  private _permissionListener: any;

  private _permissionListenerFn(args) {
    if (this._camera) {
      if ((!this.enableVideo && this._camera.hasCameraPermission()) || (this.enableVideo && this._camera.hasPermission())) {
        this._camera.startPreview();
      } else {
        //we need permissions to start the preview
        this.CError('Required permissions not granted yet, cannot show camera view!');
        this._camera.stopPreview();
      }
    }
  }

  initNativeView() {
    if ((!this.enableVideo && !this._camera.hasCameraPermission()) || (this.enableVideo && !this._camera.hasPermission())) {
      this.CLog('missing permissions, requesting...');
      if (this.enableVideo) {
        this._camera.requestPermission();
      } else if (!this.enableVideo) {
        this._camera.requestCameraPermission();
      }
    }
    const that = this;
    super.initNativeView();
    this.on(View.layoutChangedEvent, this._onLayoutChangeListener);

    const listenerImpl = (<any>io).github.triniwiz.fancycamera.CameraEventListenerUI.extend({
      owner: null,

      onReady(): void {
        that.CLog('listenerImpl.onReady()');
        that.CLog(DEVICE_INFO_STRING);
      },

      onCameraCloseUI(): void {
        that.CLog('listenerImpl.onCameraCloseUI()');
      },

      onCameraError(message: string, ex: java.lang.Exception): void {
        that.CError('listenerImpl.onCameraError:', message, ex.getMessage());
        const owner: NSCamera = this.owner ? this.owner.get() : null;
        if (owner) {
          if (owner.isRecording) {
            owner.stopRecording();
          }
          owner._lastCameraOptions.shift(); //remove the last set of options used
          owner.sendEvent(NSCamera.errorEvent, ex, message);
        } else {
          that.CError('!!! No owner reference found when handling onCameraError event');
        }
      },

      async onCameraPhotoUI(event?: java.io.File) {
        const owner: NSCamera = this.owner ? this.owner.get() : null;
        const file = event;
        const options: ICameraOptions = owner._lastCameraOptions.shift();
        let confirmPic;
        let confirmPicRetakeText;
        let confirmPicSaveText;
        let saveToGallery;
        let quality;
        let shouldAutoSquareCrop;
        if (options) {
          //if we have options saved, refer to them. otherwise fall back on properties set on camera instance
          //   only confirmPic is handled here, rest in native code
          confirmPic = options.confirmPhotos ? options.confirmPhotos : owner.confirmPhotos;
          confirmPicRetakeText = options.confirmRetakeText ? options.confirmRetakeText : owner.confirmRetakeText;
          confirmPicSaveText = options.confirmSaveText ? options.confirmSaveText : owner.confirmSaveText;
          saveToGallery = options.saveToGallery ? options.saveToGallery : owner.saveToGallery;
          shouldAutoSquareCrop = options.autoSquareCrop ? options.autoSquareCrop : owner.autoSquareCrop;
          quality = options.quality ? +options.quality : owner.quality;
        }

        that.CLog('onCameraPhotoUI has options', options);
        if (confirmPic === true) {
          that.CLog('confirmPic set, showing confirmation dialog');
          owner.sendEvent(NSCamera.confirmScreenShownEvent);
          const result = await createImageConfirmationDialog(file.getAbsolutePath(), confirmPicRetakeText, confirmPicSaveText).catch(ex => {
            that.CError('Error in createImageConfirmationDialog', ex);
          });
          owner.sendEvent(NSCamera.confirmScreenDismissedEvent);
          if (result !== true) {
            file.delete();
            return;
          }
        }

        //save a copy to the app's documents folder and return path
        let outFilepath, tempFileName;
        try {
          let source = await ImageSource.fromFile(file.getAbsolutePath());
          for (let i = 1; i < 999999999; i++) {
            tempFileName = 'photo-' + i + '.jpg';
            outFilepath = path.join(knownFolders.documents().path, tempFileName);
            if (!File.exists(outFilepath)) break;
          }

          const saved = source.saveToFile(outFilepath, 'jpg', quality);
          if (saved) {
            owner.sendEvent(NSCamera.photoCapturedEvent, outFilepath);
          } else {
            that.CError('ERROR saving image to file at path', outFilepath);
            owner.sendEvent(NSCamera.errorEvent, 'ERROR saving image to file at path: ' + outFilepath);
          }
        } catch (err) {
          that.CError('ERROR saving image to file at path', outFilepath, err);
          owner.sendEvent(NSCamera.errorEvent, err);
        }
      },

      onCameraOpenUI(): void {
        const owner: NSCamera = this.owner ? this.owner.get() : null;
        if (owner) {
          owner._initDefaultButtons();
          if (owner._togglingCamera) {
            owner._ensureCorrectFlashIcon();
            owner._togglingCamera = true;
          } else {
            setTimeout(() => {
              //give android a little more time to finish loading
              owner.sendEvent(NSCamera.cameraReadyEvent, owner.camera);
            }, 500);
          }
        }
      },
      onCameraVideoStartUI(): void {
        const owner: NSCamera = this.owner ? this.owner.get() : null;
        if (owner) {
          that.CLog('starting recording', owner, owner.isRecording);
          owner.sendEvent(NSCamera.videoRecordingStartedEvent, owner.camera);
        } else {
          that.CError('!!! No owner reference found when handling onCameraVideoStartUI event');
        }
      },
      onCameraVideoStopUI(): void {
        const owner: NSCamera = this.owner ? this.owner.get() : null;
        if (owner) {
          owner.sendEvent(NSCamera.videoRecordingFinishedEvent, owner.camera);
          that.CLog('stopped recording', owner, owner.isRecording);
        } else {
          that.CError('!!! No owner reference found when handling onCameraVideoStopUI event');
        }
      },
      onCameraVideoUI(event?: java.io.File): void {
        const owner: NSCamera = this.owner ? this.owner.get() : null;
        if (owner) {
          owner.sendEvent(NSCamera.videoRecordingReadyEvent, event.getAbsolutePath());
          that.CLog('recording ready', owner, owner.isRecording);
        } else {
          that.CError('!!! No owner reference found when handling onCameraVideoUI event');
        }
      },
      onCameraToggleUI(): void {
        const owner: NSCamera = this.owner ? this.owner.get() : null;
        if (owner) {
          owner.sendEvent(NSCamera.toggleCameraEvent, owner.camera);
          // need to check flash mode when toggling...
          // front cam may not have flash - and just ensure the correct icon shows
          owner._ensureCorrectFlashIcon();
          that.CLog('toggled camera', owner.cameraId, owner._cameraId, owner._camera.getPosition());
        } else {
          that.CError('!!! No owner reference found when handling onCameraVideoStopUI event');
        }
      },
    });
    const listener = new listenerImpl();
    listener.owner = new WeakRef(this);
    this._camera.setListener(listener);
    this.cameraId = this._cameraId;
    this.isRecording = false;
    this._camera.setDoubleTapCameraSwitch(this._doubleTapCameraSwitch);
    this._camera.setDebug(this._debug);
    this.updateQuality();
  }

  disposeNativeView() {
    this.CLog('disposeNativeView.');
    this.off(View.layoutChangedEvent, this._onLayoutChangeListener);
    Application.android.off('activityRequestPermissions', this._permissionListener);
    this.releaseCamera();
    super.disposeNativeView();
  }

  get cameraId(): number {
    return this._cameraId;
  }

  set cameraId(id: number) {
    this.CLog('set cameraID() id:', id, io.github.triniwiz.fancycamera.CameraPosition.valueOf('BACK'));
    if (this._camera) {
      switch (id) {
        case CAMERA_FACING_FRONT:
          this._camera.setPosition(io.github.triniwiz.fancycamera.CameraPosition.valueOf('FRONT'));
          this._cameraId = CAMERA_FACING_FRONT;
          break;
        default:
          this._camera.setPosition(io.github.triniwiz.fancycamera.CameraPosition.valueOf('BACK'));
          this._cameraId = CAMERA_FACING_BACK;
          break;
      }
    } else {
      this.CLog('No camera instance yet, preference saved for when camera is ready');
    }
    this._cameraId = id;
  }

  /**
   * Takes a picture using the camera preview
   */
  public takePicture(options?: ICameraOptions): void {
    if (this.isVideoEnabled()) {
      this.CError('Currently in Video mode, change to photo mode to take a picture!');
      return null;
    }
    if (this._camera) {
      // Use options if passed, otherwise use the current values set on plugin via XML or code,
      //   or fall back on plugin defaults if no properties set by user before now.
      options = {
        confirmPhotos: options?.confirmPhotos ? options.confirmPhotos : this.confirmPhotos,
        confirmRetakeText: options?.confirmRetakeText ? options.confirmRetakeText : this.confirmRetakeText,
        confirmSaveText: options?.confirmSaveText ? options.confirmSaveText : this.confirmSaveText,
        saveToGallery: options?.saveToGallery ? options.saveToGallery : this.saveToGallery,
        autoSquareCrop: options?.autoSquareCrop ? options.autoSquareCrop : this.autoSquareCrop,
        quality: options?.quality ? +options.quality : this.quality,
      };
      this.CLog('takePicture() options:', JSON.stringify(options));
      //these are the only two options need to be set on native side if they haven't been set already via properties
      this._camera.setSaveToGallery(!!options.saveToGallery);
      this._camera.setAutoSquareCrop(!!options.autoSquareCrop);
      //the rest of the options are used on NS side: confirmPhotos, confirmRetakeText, confirmSaveText, maxDimention and quality
      this._lastCameraOptions.push(options); //save these options for NS side to refer to once a photo file is returned from native code
      this._camera.takePhoto();
    }
  }

  private releaseCamera(): void {
    if (this._camera) {
      this.CLog('releaseCamera()');
      this._camera.release();
    }
  }

  // @ts-ignore
  public get autoFocus(): boolean {
    return this._camera ? this._camera.getAutoFocus() : false;
  }
  public set autoFocus(focus: boolean) {
    if (this._camera) {
      this._camera.setAutoFocus(focus);
    }
  }

  _togglingCamera = false;
  /**
   * Toggle the opened camera. Only supported on devices with multiple cameras.
   */
  public toggleCamera(): void {
    if (this._camera) {
      const camNumber = this.getNumberOfCameras();
      if (camNumber <= 1) {
        this.CLog(`Cannot switch camera, this Android Device only has ${camNumber} camera.`);
        return;
      }
      this._togglingCamera = true;
      this._camera.toggleCamera();
    }
  }

  //convenience function to get the current Android camera2 video quality
  private getVideoQuality(): CameraVideoQuality {
    if (!this.camera) {
      this.CError('No camera instance! Make sure this is created and initialized before calling updateQuality');
      return CameraVideoQuality.MAX_720P;
    }
    switch (this._camera.getVideoQuality()) {
      case io.github.triniwiz.fancycamera.Quality.valueOf('HIGHEST'):
        return CameraVideoQuality.HIGHEST;
      case io.github.triniwiz.fancycamera.Quality.valueOf('LOWEST'):
        return CameraVideoQuality.LOWEST;
      case io.github.triniwiz.fancycamera.Quality.valueOf('MAX_2160P'):
        return CameraVideoQuality.MAX_2160P;
      case io.github.triniwiz.fancycamera.Quality.valueOf('MAX_1080P'):
        return CameraVideoQuality.MAX_1080P;
      case io.github.triniwiz.fancycamera.Quality.valueOf('MAX_720P'):
        return CameraVideoQuality.MAX_720P;
      case io.github.triniwiz.fancycamera.Quality.valueOf('MAX_480P'):
        return CameraVideoQuality.MAX_480P;
      case io.github.triniwiz.fancycamera.Quality.valueOf('QVGA'):
        return CameraVideoQuality.QVGA;
      default:
        return CameraVideoQuality.MAX_720P;
    }
  }

  private updateQuality(): void {
    this.CLog('updateQuality()');
    if (!this.camera) {
      this.CError('No camera instance! Make sure this is created and initialized before calling updateQuality');
      return;
    }
    switch (this.videoQuality) {
      case CameraVideoQuality.HIGHEST:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('HIGHEST'));
        break;
      case CameraVideoQuality.LOWEST:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('LOWEST'));
        break;
      case CameraVideoQuality.MAX_2160P:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('MAX_2160P'));
        break;
      case CameraVideoQuality.MAX_1080P:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('MAX_1080P'));
        break;
      case CameraVideoQuality.MAX_720P:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('MAX_720P'));
        break;
      case CameraVideoQuality.MAX_480P:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('MAX_480P'));
        break;
      case CameraVideoQuality.QVGA:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('QVGA'));
        break;
      default:
        this._camera.setVideoQuality(io.github.triniwiz.fancycamera.Quality.valueOf('MAX_720P'));
        break;
    }
  }

  /**
   * Start recording video
   * @param options IVideoOptions
   */
  public async record(options?: IVideoOptions): Promise<void> {
    try {
      if (!this.isVideoEnabled()) {
        this.CError('in Photo mode, change to video mode to record!');
        return null;
      }
      if (this.isRecording) {
        this.CError('Currently recording, cannot call record()');
        return;
      }

      options = {
        saveToGallery: options?.saveToGallery ? options.saveToGallery : this.saveToGallery,
        videoQuality: options?.videoQuality ? options.videoQuality : this.videoQuality,
        //if the following options are not specified, -1 will let Android select based on requested videoQuality
        androidMaxVideoBitRate: options?.androidMaxVideoBitRate ? options.androidMaxVideoBitRate : -1,
        androidMaxFrameRate: options?.androidMaxFrameRate ? options.androidMaxFrameRate : -1,
        androidMaxAudioBitRate: options?.androidMaxAudioBitRate ? options.androidMaxAudioBitRate : -1,
      };
      this.CLog('record options', options);

      if (this._camera) {
        this.isRecording = true;
        this._camera.setSaveToGallery(!!options.saveToGallery);

        // -1 uses profile value;
        this._camera.setMaxAudioBitRate(options.androidMaxAudioBitRate || -1);
        this._camera.setMaxVideoBitrate(options.androidMaxVideoBitRate || -1);
        this._camera.setMaxVideoFrameRate(options.androidMaxFrameRate || -1);

        if (this.shouldLockRotation) {
          this.disableRotationAndroid();
        }

        const takePicDrawable = getImageDrawable(this.stopVideoIcon);
        this._takePicBtn.setImageResource(takePicDrawable); // set the icon
        //if we have a flash button, Hide it while recording since we cannot turn it on/off during recording
        this._flashBtn?.setVisibility(android.view.View.GONE);

        this._camera.startRecording();
      } else {
        this.CError('No camera instance! Make sure this is created and initialized before calling updateQuality');
        return;
      }
    } catch (err) {
      this.CError(err);
    }
  }

  /**
   * Stop recording video
   */
  public stop(): void {
    this.stopRecording();
  }

  /**
   * Stop camera recording and update UI
   */
  public stopRecording(): void {
    if (!this.isVideoEnabled()) {
      this.CError('in Photo mode, stop is not available');
      return null;
    }
    if (!this.isRecording) {
      this.CLog('not currently recording, cannot call stopRecording()');
      return;
    }
    if (this._camera) {
      this.CLog(`*** updating UI ***`);
      const takePicDrawable = getImageDrawable(this.takeVideoIcon);
      this._takePicBtn.setImageResource(takePicDrawable); // set the icon
      this._camera.stopRecording();
      //show the flash button again if supported
      this._ensureCorrectFlashIcon();
      this.isRecording = false;
      if (this.shouldLockRotation) {
        this.enableRotationAndroid();
      }
    } else {
      this.CError("NO camera instance attached, can't stop recording!");
    }
  }

  /**
   * Toggles the flash mode of the camera.
   */
  public toggleFlash(): void {
    if (this._camera) {
      // @ts-ignore
      this._camera.toggleFlash();
      this._ensureCorrectFlashIcon();
    }
  }

  /**
   * Gets current camera selection
   */
  public getCurrentCamera(): 'front' | 'rear' {
    if (!this._camera) return 'rear';
    switch (this._camera.getPosition()) {
      case io.github.triniwiz.fancycamera.CameraPosition.valueOf('FRONT'):
        return 'front';
      default:
        return 'rear';
    }
  }

  /**
   * Check if the device has a camera
   */
  public isCameraAvailable(): boolean {
    if (Utils.ad.getApplicationContext().getPackageManager().hasSystemFeature('android.hardware.camera')) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Gets the number of cameras on a device.
   * NOTE: this should be called after the cameraReadyEvent has been received to ensure the camera component has initialized
   */
  public getNumberOfCameras(): number {
    if (!this._camera) return 0;
    return this._camera.getNumberOfCameras();
  }

  /**
   * Check if current camera has a flash
   * @returns true if camera has a flash, false if not
   */
  public hasFlash(): boolean {
    if (!this._camera) {
      return false;
    }
    return this._camera.getHasFlash();
  }

  /**
   * **iOS-only** Check if current camera has a torch.
   * On Android, this is the same as hasFlash since it doesn't differentiate between torches and flashlights
   * @returns true if camera has a torch, false if not
   */
  hasTorch(): boolean {
    return this.hasFlash();
  }

  /**
   * Return the current flash mode of the device. Will return null if the flash mode is not supported by device.
   * @returns 'on', 'off' or null
   */
  public getFlashMode(): string {
    if (this.hasFlash()) {
      if (this._camera.getFlashMode() !== io.github.triniwiz.fancycamera.CameraFlashMode.valueOf('OFF')) {
        return 'on';
      }
      return 'off';
    }
    return null;
  }

  /**
   * Helper method to ensure the correct icon (on/off) is shown on flash.
   * Useful when toggling cameras.
   */
  _ensureCorrectFlashIcon(): void {
    // get current flash mode and set correct image drawable
    const currentFlashMode = this.getFlashMode();

    // if the flash mode is null then we need to remove the button from the parent layout as camera does not have a flash to use
    if (currentFlashMode === null) {
      // if we have the button - remove it from parent
      if (this._flashBtn) {
        this._flashBtn.setVisibility(android.view.View.GONE);
      }
      return;
    }

    // ensure flashBtn is here - if currentFlashMode is null then don't show/assign the flash button
    if (this._flashBtn === undefined || this._flashBtn === null) {
      return;
    }

    // make sure we have our flash icon button visible - sometimes toggling might set to GONE
    this._flashBtn.setVisibility(android.view.View.VISIBLE);

    // reset the image in the button first
    this._flashBtn.setImageResource((android as any).R.color.transparent);
    const flashIcon = currentFlashMode === FLASH_MODE_OFF ? this.flashOffIcon : this.flashOnIcon;
    const imageDrawable = getImageDrawable(flashIcon);
    this._flashBtn.setImageResource(imageDrawable);
  }

  private _initFlashButton(): void {
    this._flashBtn = createImageButton();
    // set correct flash icon on button
    this._ensureCorrectFlashIcon();
    const shape = createTransparentCircleDrawable();
    this._flashBtn.setBackgroundDrawable(shape);
    const ref = new WeakRef(this);
    this._flashBtn.setOnClickListener(
      new android.view.View.OnClickListener({
        onClick: args => {
          const owner = ref.get();
          if (owner) {
            owner.toggleFlash();
            owner._ensureCorrectFlashIcon();
          }
        },
      })
    );
    const flashParams = new android.widget.RelativeLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT);
    if (this.insetButtons === true) {
      // need to get the width of the screen
      const layoutWidth = this._nativeView.getWidth();
      const xMargin = layoutWidth * this.insetButtonsPercent;
      const layoutHeight = this._nativeView.getHeight();
      const yMargin = layoutHeight * this.insetButtonsPercent;
      // add margin to left and top where the button is positioned
      flashParams.setMargins(xMargin, yMargin, 8, 8);
    } else {
      flashParams.setMargins(8, 8, 8, 8);
    }
    flashParams.addRule(ALIGN_PARENT_TOP);
    flashParams.addRule(ALIGN_PARENT_LEFT);
    this._nativeView.addView(this._flashBtn, flashParams);
  }

  private _initToggleCameraButton(): void {
    this._toggleCamBtn = createImageButton();
    const switchCameraDrawable = getImageDrawable(this.toggleCameraIcon);
    this._toggleCamBtn.setImageResource(switchCameraDrawable);
    const shape = createTransparentCircleDrawable();
    this._toggleCamBtn.setBackgroundDrawable(shape);
    const ref = new WeakRef(this);
    this._toggleCamBtn.setOnClickListener(
      new android.view.View.OnClickListener({
        onClick: (view: android.view.View) => {
          const owner = ref.get();
          if (owner) {
            owner.toggleCamera();
          }
        },
      })
    );

    const toggleCamParams = new android.widget.RelativeLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT);
    if (this.insetButtons === true) {
      const layoutWidth = this._nativeView.getWidth();
      const xMargin = layoutWidth * this.insetButtonsPercent;
      const layoutHeight = this._nativeView.getHeight();
      const yMargin = layoutHeight * this.insetButtonsPercent;
      toggleCamParams.setMargins(8, yMargin, xMargin, 8);
    } else {
      toggleCamParams.setMargins(8, 8, 8, 8);
    }
    toggleCamParams.addRule(ALIGN_PARENT_TOP);
    toggleCamParams.addRule(ALIGN_PARENT_RIGHT);
    this._nativeView.addView(this._toggleCamBtn, toggleCamParams);
  }

  private _initTakePicButton(): void {
    if (this.isVideoEnabled()) {
      //video mode show a circle icon
      this._takePicBtn = new android.widget.ImageButton(Application.android.context) as android.widget.ImageButton;
      this._takePicBtn.setMaxHeight(48);
      this._takePicBtn.setMaxWidth(48);
      const takePicDrawable = getImageDrawable(this.takeVideoIcon);
      this._takePicBtn.setImageResource(takePicDrawable); // set the icon
      const shape = new android.graphics.drawable.GradientDrawable();
      shape.setColor(0x99000000);
      shape.setCornerRadius(96);
      shape.setAlpha(0);
      this._takePicBtn.setBackgroundDrawable(shape);
    } else {
      //if we're in camera photo mode, show the takePhoto icon
      this._takePicBtn = createImageButton();
      const takePicDrawable = getImageDrawable(this.takePicIcon);
      this._takePicBtn.setImageResource(takePicDrawable); // set the icon
      const shape = createTransparentCircleDrawable();
      this._takePicBtn.setBackgroundDrawable(shape); // set the transparent background
    }

    const ref = new WeakRef(this);

    this._takePicBtn.setOnTouchListener(
      new android.view.View.OnTouchListener({
        onTouch: (argsView: android.view.View, pEvent: android.view.MotionEvent) => {
          const owner = ref.get();
          if (this.isVideoEnabled()) {
            //Video mode
            //check if we're currently doing a long click for snapchat style recording UI
            if (pEvent.getAction() == android.view.MotionEvent.ACTION_UP) {
              if (this.isButtonLongPressed) {
                //Note: if scrollview moves with this view inside, this will trigger false positives
                this.isButtonLongPressed = false;
                this.stop();
                return false;
              } else {
                return true;
              }
            } else if (pEvent.getAction() == android.view.MotionEvent.ACTION_DOWN) {
              if (!this.isButtonLongPressed && !owner.isRecording) {
                this.record();
              }
            }
          } else {
            //Photo Capture
            if (!this.isButtonLongPressed && pEvent.getAction() == android.view.MotionEvent.ACTION_DOWN) {
              if (owner) {
                owner.takePicture();
              }
            }
          }
          return false;
        },
      })
    );

    this._takePicBtn.setOnLongClickListener(
      new android.view.View.OnLongClickListener({
        onLongClick: (argsView: android.view.View) => {
          if (this.isVideoEnabled()) {
            this.isButtonLongPressed = true;
          }
          return false;
        },
      })
    );

    const takePicParams = new android.widget.RelativeLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT);
    if (this.insetButtons === true) {
      const layoutHeight = this._nativeView.getHeight();
      const yMargin = layoutHeight * this.insetButtonsPercent;
      takePicParams.setMargins(8, 8, 8, yMargin);
    } else {
      takePicParams.setMargins(8, 8, 8, 8);
    }
    takePicParams.addRule(ALIGN_PARENT_BOTTOM);
    takePicParams.addRule(CENTER_HORIZONTAL);
    this._nativeView.addView(this._takePicBtn, takePicParams);
  }

  /**
   * Creates the default buttons depending on the options to show the various default buttons.
   */
  private _initDefaultButtons(): void {
    try {
      // flash button setup - if the device doesn't support flash do not setup/show this button
      if (this.showFlashIcon === true && this.getFlashMode() !== null && this._flashBtn === null) {
        this._initFlashButton();
      }
      // camera toggle button setup
      if (this.showToggleIcon === true && this.getNumberOfCameras() > 1 && this._toggleCamBtn === null) {
        this._initToggleCameraButton();
      }
      // take picture button setup
      if (this.showCaptureIcon === true && this._takePicBtn === null) {
        if (this.showFlashIcon === true && this.getFlashMode() !== null && this._flashBtn === null) {
          this._initFlashButton();
        }
        // camera toggle button setup
        if (this.showToggleIcon === true && this.getNumberOfCameras() > 1 && this._toggleCamBtn === null) {
          this._initToggleCameraButton();
        }
        // take picture button setup
        if (this.showCaptureIcon === true && this._takePicBtn === null) {
          this._initTakePicButton();
        }
      }
    } catch (ex) {
      this.CError('_initDefaultButtons error', ex);
    }
  }

  /**
   * @function enableRotation
   */
  private enableRotationAndroid(): void {
    if (!Application.android || !Application.android.foregroundActivity) {
      setTimeout(this.enableRotationAndroid, 100);
      return;
    }

    const activity = Application.android.foregroundActivity;
    activity.setRequestedOrientation(13);
  }

  /**
   * @function disableRotation
   */
  private disableRotationAndroid(disallowPlayerOverride = false): void {
    if (!Application.android || !Application.android.foregroundActivity) {
      setTimeout(this.disableRotationAndroid, 100);
      return;
    }

    const activity = Application.android.foregroundActivity;
    activity.setRequestedOrientation(14); // SCREEN_ORIENTATION_LOCKED = 14
  }

  /**
   * Merge an array of video filenames, must all be valid mp4 video files with same audio and video encoding
   * Note: Android MediaMuxer support for multiple audio/video tracks only on API 26+
   * @param inputFiles string[] Array of video file paths to merge
   * @param outputPath string Path to save merged video to
   * @returns Promise<File> merged File
   */
  public mergeVideoFiles(inputFiles: string[], outputPath: string): Promise<File> {
    return new Promise((resolve, reject) => {
      if (+Device.sdkVersion < 26) {
        this.CError('This is only supported on API 26+');
        return reject('This is only supported on API 26+');
      }
      if (!inputFiles || inputFiles.length <= 0) return reject('inputFiles is empty!');
      if (!outputPath) return reject('outputPath should be a valid path string');
      if (File.exists(outputPath)) {
        // remove file if it exists
        File.fromPath(outputPath).removeSync(err => {
          this.CError('Unable to remove file!', err);
          return reject('Unable to remove file!' + err.message);
        });
      }
      if (inputFiles.length == 1) {
        const fileData = File.fromPath(inputFiles[0]).readSync();
        File.fromPath(outputPath).writeSync(fileData);
        return resolve(File.fromPath(outputPath));
      }

      // Create the MediaMuxer and specify the output file
      const muxer = new android.media.MediaMuxer(outputPath, android.media.MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
      const MAX_SAMPLE_SIZE = 1024 * 1024;
      const APPEND_DELAY = 200; //we add a little delay between segments to make segmentation a little more obvious
      let totalDuration = 0;
      let audioFormat: android.media.MediaFormat = null;
      let videoFormat: android.media.MediaFormat = null;
      let audioTrackIndex = -1;
      let videoTrackIndex = -1;
      let outRotation = 0;
      try {
        let muxerStarted = false;
        for (let i = 0; i < inputFiles.length; i++) {
          let mediadata = new android.media.MediaMetadataRetriever();
          mediadata.setDataSource(inputFiles[i]);
          let trackDuration = 0;
          try {
            trackDuration = +mediadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
            const orientation = mediadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
            outRotation = +orientation;
          } catch (err) {
            this.CError('Unable to extract trackDuration from metadata!');
          }

          //find video format and select the video track to read from later
          let videoExtractor: android.media.MediaExtractor = new android.media.MediaExtractor();
          videoExtractor.setDataSource(inputFiles[i]);
          const videoTracks = videoExtractor.getTrackCount();

          for (let j = 0; j < videoTracks; j++) {
            const mf = videoExtractor.getTrackFormat(j);
            const mime = mf.getString(android.media.MediaFormat.KEY_MIME);
            if (mime.startsWith('video/')) {
              videoExtractor.selectTrack(j);
              if (!videoFormat) {
                videoFormat = videoExtractor.getTrackFormat(j);
              }
              break;
            }
          }
          //TODO: should check that all other segment formats match first segment before merging

          //find audio format and select the audio track to read from later
          let audioExtractor: android.media.MediaExtractor = new android.media.MediaExtractor();
          audioExtractor.setDataSource(inputFiles[i]);
          const audioTracks = audioExtractor.getTrackCount();

          for (let j = 0; j < audioTracks; j++) {
            const mf = audioExtractor.getTrackFormat(j);
            const mime = mf.getString(android.media.MediaFormat.KEY_MIME);
            if (mime.startsWith('audio/')) {
              audioExtractor.selectTrack(j);
              if (!audioFormat) {
                audioFormat = audioExtractor.getTrackFormat(j);
              }
              break;
            }
          }

          if (audioTrackIndex == -1) {
            audioTrackIndex = muxer.addTrack(audioFormat);
          }
          if (videoTrackIndex == -1) {
            videoTrackIndex = muxer.addTrack(videoFormat);
          }
          videoExtractor.seekTo(0, android.media.MediaExtractor.SEEK_TO_CLOSEST_SYNC);
          audioExtractor.seekTo(0, android.media.MediaExtractor.SEEK_TO_CLOSEST_SYNC);

          let sawEOS = false;
          let sawAudioEOS = false;
          const bufferSize = MAX_SAMPLE_SIZE;
          let audioBuf = java.nio.ByteBuffer.allocate(bufferSize);
          let videoBuf = java.nio.ByteBuffer.allocate(bufferSize);
          const offset = 100;
          let videoBufferInfo: android.media.MediaCodec.BufferInfo = new android.media.MediaCodec.BufferInfo();
          let audioBufferInfo: android.media.MediaCodec.BufferInfo = new android.media.MediaCodec.BufferInfo();

          // start muxer if not started yet
          if (!muxerStarted) {
            muxer.setOrientationHint(outRotation); //ensure merged video has same orientation as inputs
            muxer.start();
            muxerStarted = true;
          }
          //add file data
          //write video
          while (!sawEOS) {
            const videoSize = videoExtractor.readSampleData(videoBuf, offset);
            if (videoSize < 0) {
              sawEOS = true;
            } else {
              //trying to set properties directly on BufferInfo objects doesn't work, need to use the set function
              videoBufferInfo.set(offset, videoSize, videoExtractor.getSampleTime() + totalDuration * 1000 + APPEND_DELAY, android.media.MediaCodec.BUFFER_FLAG_KEY_FRAME);
              muxer.writeSampleData(videoTrackIndex, videoBuf, videoBufferInfo);
              videoExtractor.advance();
            }
          }

          //write audio
          while (!sawAudioEOS) {
            const audioSize = audioExtractor.readSampleData(audioBuf, offset);
            if (audioSize < 0) {
              sawAudioEOS = true;
            } else {
              audioBufferInfo.set(offset, audioSize, audioExtractor.getSampleTime() + totalDuration * 1000 + APPEND_DELAY, android.media.MediaCodec.BUFFER_FLAG_KEY_FRAME);
              muxer.writeSampleData(audioTrackIndex, audioBuf, audioBufferInfo);
              audioExtractor.advance();
            }
          }

          mediadata.release();
          mediadata = null;
          videoBufferInfo = audioBufferInfo = null;
          audioBuf = videoBuf = null;
          videoExtractor.release();
          videoExtractor = null;
          audioExtractor.release();
          audioExtractor = null;
          totalDuration += trackDuration;
          Utils.GC();
        }
        muxer.stop();
        muxer.release();
        this.CLog('finished merging video segments into ', outputPath);
        return resolve(File.fromPath(outputPath));
      } catch (err) {
        this.CError(err, err.message);
        return reject('Error during merge: ' + err.message);
      }
    });
  }
}

/**
 * Helper method to get the drawable id of an app_resource icon for the ImageButtons 'image'
 * @param iconName
 */
export function getImageDrawable(iconName: string): number {
  const drawableId = Application.android.context.getResources().getIdentifier(iconName, 'drawable', Application.android.context.getPackageName()) as number;
  return drawableId;
}

/**
 * Helper method to create an android ImageButton
 */
export function createImageButton(): android.widget.ImageButton {
  const btn = new android.widget.ImageButton(Application.android.context) as android.widget.ImageButton;
  btn.setPadding(24, 24, 24, 24);
  btn.setMaxHeight(48);
  btn.setMaxWidth(48);
  return btn;
}

/**
 * Creates a new rounded GradientDrawable with transparency and rounded corners.
 */
export function createTransparentCircleDrawable(): android.graphics.drawable.GradientDrawable {
  const shape = new android.graphics.drawable.GradientDrawable();
  shape.setColor(0x99000000);
  shape.setCornerRadius(96);
  shape.setAlpha(160);
  return shape;
}
/**
 * Helper method to get the optimal sizing for the preview from the camera.
 * Android cameras support different sizes for previewing.
 * @param sizes
 * @param width
 * @param height
 */
export function getOptimalPreviewSize(sizes: java.util.List<android.hardware.Camera.Size>, width: number, height: number): android.hardware.Camera.Size {
  const targetRatio = height / width;

  if (sizes === null) return null;

  let optimalSize = null as android.hardware.Camera.Size;

  const targetHeight = height;

  for (let i = 0; i < sizes.size(); i++) {
    const element = sizes.get(i) as android.hardware.Camera.Size;
    if (element.width <= width && element.height <= height) {
      if (optimalSize == null) {
        optimalSize = element;
      } else {
        const resultArea = optimalSize.width * optimalSize.height;
        const newArea = element.width * element.height;

        if (newArea > resultArea) {
          optimalSize = element;
        }
      }
    }
  }
  return optimalSize;
}

/**
 * Helper method to get the optimal sizing for the picture from the camera.
 * Android cameras support different sizes for taking picture.
 * @param sizes
 * @param width
 * @param height
 */
export function getOptimalPictureSize(sizes: java.util.List<android.hardware.Camera.Size>, width: number, height: number): android.hardware.Camera.Size {
  let sizeSet = false;

  if (sizes === null) return null;

  let optimalSize = null as android.hardware.Camera.Size;
  let minDiff = Number.MAX_SAFE_INTEGER;

  const targetHeight = height;
  const targetWidth = height;

  for (let i = 0; i < sizes.size(); i++) {
    const size = sizes.get(i) as android.hardware.Camera.Size;
    let desiredMinimumWidth: number;
    let desiredMaximumWidth: number;

    if (width > 1000) {
      desiredMinimumWidth = width - 200;
      desiredMaximumWidth = width + 200;
    } else {
      desiredMinimumWidth = 800;
      desiredMaximumWidth = 1200;
    }

    if (size.width > desiredMinimumWidth && size.width < desiredMaximumWidth && size.height < size.width) {
      optimalSize = size;
      sizeSet = true;
      break;
    }
  }

  if (!sizeSet) {
    // minDiff = Double.MAX_VALUE;
    minDiff = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < sizes.size(); i++) {
      const element = sizes.get(i) as android.hardware.Camera.Size;
      if (Math.abs(element.height - targetHeight) < minDiff) {
        optimalSize = element;
        minDiff = Math.abs(element.height - targetHeight);
      }
    }
    sizeSet = true;
  }

  return optimalSize;
}

/**
 * Calculate the largest inSampleSize value that is a power of 2 and keeps both
 *  height and width larger than the requested height and width.
 * @param options
 * @param reqWidth
 * @param reqHeight
 * @returns
 */
export function calculateInSampleSize(options: android.graphics.BitmapFactory.Options, reqWidth: number, reqHeight: number) {
  // Raw height and width of image
  const height = options.outHeight;
  const width = options.outWidth;
  let inSampleSize = 1;

  if (height > reqHeight || width > reqWidth) {
    const halfHeight = height / 2;
    const halfWidth = width / 2;

    while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
      inSampleSize *= 2;
    }
  }

  return inSampleSize;
}

/**
 * Returns the orientation from exif data using the camera byte array
 * @param data
 * @returns
 */
export function getOrientationFromBytes(data): number {
  // We won't auto-rotate the front Camera image
  const inputStream = new java.io.ByteArrayInputStream(data);
  let exif;
  if (android.os.Build.VERSION.SDK_INT >= 24) {
    exif = new android.media.ExifInterface(inputStream as any);
  } else {
    exif = new (android.support as any).media.ExifInterface(inputStream);
  }
  let orientation = exif.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_UNDEFINED);
  try {
    inputStream.close();
  } catch (ex) {
    console.error('byteArrayInputStream.close error', ex);
  }
  if (this.cameraId === 1) {
    if (orientation === 1) {
      orientation = 2;
    } else if (orientation === 3) {
      orientation = 4;
    } else if (orientation === 6) {
      orientation = 7;
    }
  }
  return orientation;
}

/**
 * Creates an Android alert dialog containing a preview image and confirm/cancel buttons for user to approve taken photo
 * @param file
 * @param retakeText
 * @param saveText
 * @returns boolean if user approved or denied the preview image shown
 */
export function createImageConfirmationDialog(file, retakeText = 'Retake', saveText = 'Save'): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const alert = new android.app.AlertDialog.Builder(Application.android.foregroundActivity) as android.app.AlertDialog.Builder;
      alert.setOnDismissListener(
        new android.content.DialogInterface.OnDismissListener({
          onDismiss: dialog => {
            resolve(false);
          },
        })
      );

      const layout = new android.widget.LinearLayout(Application.android.context) as android.widget.LinearLayout;
      layout.setOrientation(1);
      layout.setMinimumHeight(800);
      layout.setMinimumWidth(600);
      // - Brad - working on OOM issue - use better Bitmap creation
      // https://developer.android.com/topic/performance/graphics/load-bitmap.html
      const bitmapFactoryOpts = new android.graphics.BitmapFactory.Options();
      bitmapFactoryOpts.inJustDecodeBounds = true;
      let picture = android.graphics.BitmapFactory.decodeFile(file, bitmapFactoryOpts);
      bitmapFactoryOpts.inMutable = false;
      bitmapFactoryOpts.inSampleSize = calculateInSampleSize(bitmapFactoryOpts, 600, 800);

      // decode with inSampleSize set now
      bitmapFactoryOpts.inJustDecodeBounds = false;

      picture = android.graphics.BitmapFactory.decodeFile(file, bitmapFactoryOpts);

      const img = new android.widget.ImageView(Application.android.context);

      const scale = Application.android.context.getResources().getDisplayMetrics().density;
      img.setPadding(0, 10 * scale, 0, 0);
      img.setMinimumHeight(800);
      img.setMinimumWidth(600);
      img.setImageBitmap(picture);
      layout.addView(img);
      alert.setView(layout);
      alert.setNegativeButton(
        retakeText,
        new android.content.DialogInterface.OnClickListener({
          onClick: (dialog, which) => {
            resolve(false);
          },
        })
      );

      alert.setPositiveButton(
        saveText,
        new android.content.DialogInterface.OnClickListener({
          onClick: (dialog, which) => {
            resolve(true);
          },
        })
      );
      alert.show();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Create current date time stamp similar to Java Date()
 */
export function createDateTimeStamp() {
  let result = '';
  const date = new Date();
  result =
    date.getFullYear().toString() +
    (date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1).toString() : (date.getMonth() + 1).toString()) +
    (date.getDate() < 10 ? '0' + date.getDate().toString() : date.getDate().toString()) +
    '_' +
    date.getHours().toString() +
    date.getMinutes().toString() +
    date.getSeconds().toString();
  return result;
}

export function getUniqueId(): string {
  const id = java.util.UUID.randomUUID().toString();
  return id;
}
