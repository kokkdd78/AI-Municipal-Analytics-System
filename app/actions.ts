"use server"

export async function analyzeImage(imageBase64: string) {
  if (!imageBase64) {
    console.log("[v0] No image provided")
    return {
      category: "Unknown",
      severity: "Medium",
      description: "No image provided.",
    }
  }

  // Users will manually describe their issues
  return {
    category: "Infrastructure Issue",
    severity: "Medium",
    description: "Please describe the issue you see in the photo.",
  }
}
