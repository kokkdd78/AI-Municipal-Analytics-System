"use server"

export async function getStaticMapUrl(lat: number, lng: number) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return null
  }

  const baseUrl = "https://maps.googleapis.com/maps/api/staticmap"
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "16",
    size: "600x400",
    markers: `color:red|${lat},${lng}`,
    key: apiKey,
  })

  return `${baseUrl}?${params.toString()}`
}

export async function getStaticMapThumbnail(lat: number, lng: number) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return null
  }

  const baseUrl = "https://maps.googleapis.com/maps/api/staticmap"
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "14",
    size: "160x160",
    scale: "2",
    markers: `color:red|${lat},${lng}`,
    key: apiKey,
  })

  return `${baseUrl}?${params.toString()}`
}
