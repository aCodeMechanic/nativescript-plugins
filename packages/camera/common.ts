/* eslint-disable @typescript-eslint/no-empty-function */
/**********************************************************************************
  2017, nStudio, LLC & LiveShopper, LLC
  2023, VoiceThread - Angel Dominguez
  2024, Angel Engineering - Angel Dominguez
 **********************************************************************************/

import { ContentView, File, isAndroid } from '@nativescript/core';
import { NSCamera as NSCameraDefinition } from '.';

export type CameraTypes = 'front' | 'rear';

export abstract class NSCameraBase extends ContentView implements NSCameraDefinition {
  @GetSetProperty()
  public debug = true;

  /**
   * Video Mode (off by default). If false, then plugin will operate in photo mode.
   * Users should set this in a component constructor before their view creates the component
   * and can reset it before using it in different views if they want to go back/forth
   * between photo-camera and video-camera
   */
  @GetSetProperty()
  public enableVideo = false;

  /**
   * Default camera: (default to 'rear')
   * Can be set before initialization or after to select which camera the plugin should use currently
   */
  @GetSetProperty()
  public defaultCamera: CameraTypes = 'rear';

  /*
   * String value for hooking into the errorEvent. This event fires when an error is emitted from NSCamera.
   */
  public static errorEvent = 'errorEvent';

  /**
   * String value for hooking into the photoCapturedEvent. This event fires when a photo is taken.
   */
  public static photoCapturedEvent = 'photoCapturedEvent';

  /**
   * String value for hooking into the toggleCameraEvent. This event fires when the device camera is toggled.
   */
  public static toggleCameraEvent = 'toggleCameraEvent';

  /**
   * String value when hooking into the videoRecordingStartedEvent. This event fires when video starts recording.
   */
  public static videoRecordingStartedEvent = 'videoRecordingStartedEvent';

  /**
   * String value when hooking into the videoRecordingFinishedEvent. This event fires when video stops recording but has not processed yet.
   */
  public static videoRecordingFinishedEvent = 'videoRecordingFinishedEvent';

  /**
   * String value when hooking into the videoRecordingReadyEvent. This event fires when video has completed processing and is ready to be used.
   */
  public static videoRecordingReadyEvent = 'videoRecordingReadyEvent';

  /**
   * String value for hooking into the cameraReadyEvent. This event fires when the native camera is done initializing.
   */
  public static cameraReadyEvent = 'cameraReadyEvent';
  /**
   * String value when hooking into the confirmScreenShownEvent. This event fires when the picture confirm dialog is shown.
   */
  public static confirmScreenShownEvent = 'confirmScreenShownEvent';

  /**
   * String value when hooking into the confirmScreenDismissedEvent. This event fires when the picture confirm dialog is dismissed either by Retake or Save button.
   */
  public static confirmScreenDismissedEvent = 'confirmScreenDismissedEvent';

  /**
   * @default "4:3"
   * *ANDROID ONLY*  A string to represent the camera preview aspect ratio. Currently they are grouped as:
    1.0F -> key = "1:1"
    1.2F..1.2222222F -> key = "6:5"
    1.3F..1.3333334F -> key = "4:3"
    1.77F..1.7777778F -> key = "16:9"
    1.5F -> key = "3:2"
   */
  @GetSetProperty()
  public ratio: string;

  /**
   *  Zoom is a float between  0 - 1 that scales from no zoom to max current camera zoom
   */
  @GetSetProperty()
  public zoom = 0;

  /**
   *  *ANDROID ONLY* Camera white balance setting when taking pictures or video.
   *    NOTE: this is currently not working to set, only to read. Default is Auto.
   */
  @GetSetProperty()
  public whiteBalance: WhiteBalance | string = WhiteBalance.Auto;

  /**
   * If true the default take picture event will present a confirmation dialog. Default is false.
   */
  @GetSetProperty()
  public confirmPhotos = false;

  /**
   * When confirming capture this text will be presented to the user to retake the photo. Default is 'Retake'
   */
  @GetSetProperty()
  public confirmRetakeText?: string = 'Retake';

  /**
   * When confirming capture this text will be presented to the user to save the photo. Default is 'Save'
   */
  @GetSetProperty()
  public confirmSaveText?: string = 'Save';

  /**
   * The resolution used when capturing video from camera
   */
  @GetSetProperty()
  public videoQuality: CameraVideoQuality = CameraVideoQuality.HIGHEST;

  /**
   * TODO: not supported yet
   * The requested height of video being captured
   */
  // @GetSetProperty()
  // public videoHeight: number = 1080;

  /**
   * TODO: not supported yet
   * The requested height of video being captured
   */
  // @GetSetProperty()
  // public videoWidth: number = 720;

  /**
   * TODO: not supported yet
   * If true the default videorecordingready event will present a confirmation dialog. Default is false.
   */
  // @GetSetProperty()
  // public confirmVideo: boolean = false;

  /**
   * If true locks device UI orientation while recording video. Default is true
   */
  @GetSetProperty()
  public shouldLockRotation = true;

  /**
   * If true the default take picture event will save to device gallery. Default is true.
   */
  @GetSetProperty()
  public saveToGallery = true;

  /**
   * Quality is a number between 1-100 that is used when saving the image as a JPEG before the File reference is returned by plugin
   * NOTE: this only applies to photos, videos not supported yet
   */
  @GetSetProperty()
  public quality = 95;

  /**
   * If true the default flash toggle icon/button will show on the NSCamera layout. Default is true.
   * Note: if the currently selected camera does not have a flash associated, this will be hidden
   */
  @GetSetProperty()
  public showFlashIcon = true;

  /**
   * If true the default camera toggle (front/back) icon/button will show on the NSCamera layout. Default is true.
   */
  @GetSetProperty()
  public showToggleIcon = true;

  /**
   * If true the default capture (take picture) icon/button will show on the NSCamera layout. Default is true.
   */
  @GetSetProperty()
  public showCaptureIcon = true;

  /**
   * *ANDROID ONLY* - allows setting a custom app_resource drawable icon for the Toggle Flash button icon when flash is on (enabled).
   */
  @GetSetProperty()
  public flashOnIcon = '';

  /**
   * *ANDROID ONLY* - allows setting a custom app_resource drawable icon for the Toggle Flash button icon when flash is off (disabled).
   */
  @GetSetProperty()
  public flashOffIcon = '';

  /**
   * *ANDROID ONLY* - allows setting a custom app_resource drawable icon for the Toggle Flash button icon when flash is off (disabled).
   */
  @GetSetProperty()
  public toggleCameraIcon = '';

  /**
   * *ANDROID ONLY* - allows setting a custom app_resource drawable icon for the Capture button icon.
   */
  @GetSetProperty()
  public takePicIcon = '';

  /**
   * *ANDROID ONLY* - If true the camera will auto focus to capture the image. Default is true.
   */
  @GetSetProperty()
  public autoFocus = true;

  /**
   * Enable/disable double tap gesture on preview view to switch camera. Default is true.
   */
  @GetSetProperty()
  public doubleTapCameraSwitch = true;

  /**
   *  If true it will crop the picture to the center square
   */
  @GetSetProperty()
  public autoSquareCrop = false;

  /**
   * Toggles the device camera (front/back).
   */
  toggleCamera(): void {}

  /**
   * Toggles the active camera flash mode.
   */
  toggleFlash(): void {}

  /**
   * Return the current flash mode of the device. Will return null if the flash mode is not supported by device.
   * @returns 'on', 'off' or null
   */
  getFlashMode(): string {
    return null;
  }

  /**
   * Takes a picture of the current preview of the NSCamera.
   */
  abstract takePicture(options?: ICameraOptions): void;

  /**
   * Start recording video
   * @param options IVideoOptions
   */
  abstract record(options?: IVideoOptions): Promise<void>;

  /**
   * Stop recording video
   */
  abstract stop(): void;

  /**
   * Merge an array of video filenames, must all be valid mp4 video files with same audio and video encoding
   * Note: Android MediaMuxer support for multiple audio/video tracks only on API 26+
   * @param inputFiles string[] Array of video file paths to merge
   * @param outputPath string Path to save merged video to
   * @returns Promise<File> merged File
   */
  abstract mergeVideoFiles(inputFiles: string[], outputPath: string): Promise<File>;

  /**
   * Utility to log information on the video format used by the video file at `videoPath`
   * @param videoPath string path of video file to read codec information from
   */
  public getVideoCodec(videoPath: string): string {
    let videoFormat: any = null;
    if (isAndroid) {
      const mediadata = new android.media.MediaMetadataRetriever();
      mediadata.setDataSource(videoPath);

      //find video format and select the video track to read from
      const videoExtractor: android.media.MediaExtractor = new android.media.MediaExtractor();
      videoExtractor.setDataSource(videoPath);
      const videoTracks = videoExtractor.getTrackCount();

      for (let j = 0; j < videoTracks; j++) {
        const mf = videoExtractor.getTrackFormat(j);
        const mime = mf.getString(android.media.MediaFormat.KEY_MIME);
        if (mime.startsWith('video/')) {
          videoExtractor.selectTrack(j);
          videoFormat = videoExtractor.getTrackFormat(j);
          break;
        }
      }
    } else {
      const filePath = NSURL.fileURLWithPath(videoPath);
      const avAsset = AVURLAsset.assetWithURL(filePath);
      const track: AVAssetTrack = avAsset.tracksWithMediaType(AVMediaTypeVideo).firstObject;
      if (!track) {
        this.CError('No video track found, cannot extract metadata information!');
        return null;
      }

      const mediaSubtypes = track.formatDescriptions;
      for (let i = 0; i < mediaSubtypes.count; i++) {
        const type = mediaSubtypes.objectAtIndex(i);
        const subtype = CMFormatDescriptionGetMediaSubType(type);
        //extract from byte array
        const bytes = [(subtype >> 24) & 0xff, (subtype >> 16) & 0xff, (subtype >> 8) & 0xff, subtype & 0xff, 0];
        const str = bytes
          .map(byte => {
            return String.fromCharCode(byte);
          })
          .join('');
        videoFormat = str;
      }
    }
    if (!videoFormat) {
      this.CError('No video track found, cannot extract metadata information!');
    }
    return videoFormat;
  }

  /**
   * Utility to check video resolution for the video file at `videoPath`
   * @param videoPath string path of video file to read resolution information from
   */
  public getVideoResolution(videoPath: string): { width: number; height: number } {
    if (isAndroid) {
      const metaRetriever = new android.media.MediaMetadataRetriever();
      metaRetriever.setDataSource(videoPath);
      return {
        width: +metaRetriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH),
        height: +metaRetriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT),
      };
    } else {
      const filePath = NSURL.fileURLWithPath(videoPath);
      const avAsset = AVURLAsset.assetWithURL(filePath);
      const track = avAsset.tracksWithMediaType(AVMediaTypeVideo).firstObject;
      if (!track) {
        this.CError('No video track found, cannot extract metadata information!');
        return {
          width: 0,
          height: 0,
        };
      }
      const size = track.naturalSize;
      return {
        width: size.width,
        height: size.height,
      };
    }
  }

  /**
   * Utility to find the duration in milliseconds of the video file at `videoPath`
   * @param videoPath string path of video file to read duration information from
   */
  public getVideoDuration(videoPath: string): number {
    let totalTime = 0;
    if (isAndroid) {
      const mediadata = new android.media.MediaMetadataRetriever();
      mediadata.setDataSource(videoPath);
      totalTime = +mediadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
    } else {
      const filePath = NSURL.fileURLWithPath(videoPath);
      const avAsset = AVURLAsset.assetWithURL(filePath);
      totalTime = CMTimeGetSeconds(avAsset.duration) * 1000;
    }
    return totalTime;
  }

  /**
   * Returns true if the device has at least one camera.
   */
  isCameraAvailable(): boolean {
    return false;
  }

  /**
   * Returns current camera <front | rear>
   */
  getCurrentCamera(): 'rear' | 'front' {
    return 'rear';
  }

  /**
   * Gets the number of cameras on a device.
   * NOTE: this should be called after the cameraReadyEvent has been received to ensure the camera component has initialized
   */
  getNumberOfCameras(): number {
    return 0;
  }

  /**
   * Check if current camera has a flash
   * @returns true if camera has a flash, false if not
   */
  hasFlash(): boolean {
    return false;
  }

  /**
   * **iOS-only** Check if current camera has a torch.
   * On Android, this is the same as hasFlash since it doesn't differentiate between torches and flashlights
   * @returns true if camera has a torch, false if not
   */
  hasTorch(): boolean {
    return false;
  }

  /**
   * Notify events by name and optionally pass data
   */
  public sendEvent(eventName: string, data?: any, msg?: string) {
    this.notify({
      eventName,
      object: this,
      data,
      message: msg,
    });
  }

  /*
   * Logging functions controlled by debug property
   */
  CLog(...args) {
    if (this.debug) {
      console.log('NSCamera ---', args);
    }
  }

  CError(...args) {
    if (this.debug) {
      console.error('NSCamera ---', args);
    }
  }
}

export interface ICameraOptions {
  confirmPhotos?: boolean;
  saveToGallery?: boolean;
  quality?: number;
  autoSquareCrop?: boolean;
  confirmRetakeText?: string;
  confirmSaveText?: string;
}

export enum CameraVideoQuality {
  MAX_480P = '480p',
  MAX_720P = '720p',
  MAX_1080P = '1080p',
  MAX_2160P = '2160p',
  HIGHEST = 'highest',
  LOWEST = 'lowest',
  QVGA = 'qvga',
}

export interface IVideoOptions {
  saveToGallery?: boolean; //shared with ICameraOptions
  videoQuality?: CameraVideoQuality;
  // videoHeight?: number; //TODO: not supported yet
  // videoWidth?: number; //TODO: not supported yet
  androidMaxVideoBitRate?: number;
  androidMaxFrameRate?: number;
  androidMaxAudioBitRate?: number;
}

/**
 *  *ANDROID ONLY* Camera white balance setting
 */
export enum WhiteBalance {
  Auto = 'auto',
  Sunny = 'sunny',
  Cloudy = 'cloudy',
  Shadow = 'shadow',
  Twilight = 'twilight',
  Fluorescent = 'fluorescent',
  Incandescent = 'incandescent',
  WarmFluorescent = 'warm-fluorescent',
}

export function GetSetProperty() {
  return (target, propertyKey: string) => {
    Object.defineProperty(target, propertyKey, {
      get: function () {
        return this['__' + propertyKey];
      },
      set: function (value) {
        if (this['__' + propertyKey] === value) {
          return;
        }
        if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        }
        this['__' + propertyKey] = value;
      },
      enumerable: true,
      configurable: true,
    });
  };
}
