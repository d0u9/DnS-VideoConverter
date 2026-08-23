export interface Settings {
  ffmpegPath: string
  ffprobePath: string
  defaultCrf: number
  defaultResolution: string
  /** Folders the remote web viewer's file browser is allowed to look inside. */
  remoteBrowseRoots: string[]
  remoteServerPort: number
}
