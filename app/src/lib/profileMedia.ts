const STORAGE_PREFIX = 'transmit_profile_media:'

export type ProfileMedia = {
  avatarUrl: string | null
  bannerUrl: string | null
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

export function loadProfileMedia(userId: string): ProfileMedia {
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return { avatarUrl: null, bannerUrl: null }
    const parsed = JSON.parse(raw) as Partial<ProfileMedia>
    return {
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null,
      bannerUrl: typeof parsed.bannerUrl === 'string' ? parsed.bannerUrl : null,
    }
  } catch {
    return { avatarUrl: null, bannerUrl: null }
  }
}

export function saveProfileMedia(userId: string, media: ProfileMedia): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(media))
    window.dispatchEvent(
      new CustomEvent('transmit-profile-media', { detail: { userId } }),
    )
  } catch {
    // quota / private mode — ignore
  }
}

/** Read a local image file as a data URL (survives tab switches + reload). */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File must be an image'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('Failed to read image'))
    }
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}
