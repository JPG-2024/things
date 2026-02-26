// Browser-based fallback method
export async function getImageColor(imageUrl: string): Promise<string> {
	return new Promise((resolve) => {
		const img = new Image()
		img.crossOrigin = "Anonymous"
		img.onload = () => {
			const canvas = document.createElement("canvas")
			canvas.width = img.width
			canvas.height = img.height
			const ctx = canvas.getContext("2d")
			if (!ctx) {
				resolve("rgb(100, 100, 100)") // Color por defecto en caso de error
				return
			}
			// Resize canvas to max 200x200 for faster processing
			const maxDim = 200
			let scaledWidth = img.width
			let scaledHeight = img.height

			if (img.width > maxDim || img.height > maxDim) {
				const ratio = Math.min(maxDim / img.width, maxDim / img.height)
				scaledWidth = Math.round(img.width * ratio)
				scaledHeight = Math.round(img.height * ratio)
				canvas.width = scaledWidth
				canvas.height = scaledHeight
			}

			ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight)

			let imageData: ImageData
			try {
				imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight)
			} catch {
				// Puede fallar por canvas tainted (CORS). Mantén el fallback.
				resolve("rgb(100, 100, 100)")
				return
			}

			const pixelData = imageData.data

			// Muestreo determinista (cada N píxeles) para performance
			const numPixels = 4000 // un poco más para mejorar estabilidad del histograma
			const step = Math.max(1, Math.floor(pixelData.length / 4 / numPixels))

			// Histograma cuantizado: agrupa colores cercanos y elige el bucket más frecuente
			// 4 bits por canal => 16 niveles => 4096 buckets
			const shift = 4
			const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()

			const BLACK_THRESHOLD = 35 // sube/baja según qué tan agresivo quieras el filtro
			const isNearBlack = (r: number, g: number, b: number) =>
				r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD

			for (let i = 0; i < pixelData.length; i += step * 4) {
				const pr = pixelData[i]
				const pg = pixelData[i + 1]
				const pb = pixelData[i + 2]
				const pa = pixelData[i + 3]

				if (pa < 200) continue

				// Descarta blancos
				if (pr > 240 && pg > 240 && pb > 240) continue

				// Descarta negro/casi negro de la muestra
				if (isNearBlack(pr, pg, pb)) continue

				const qr = pr >> shift
				const qg = pg >> shift
				const qb = pb >> shift
				const key = (qr << 8) | (qg << 4) | qb

				const prev = buckets.get(key)
				if (prev) {
					prev.count += 1
					prev.r += pr
					prev.g += pg
					prev.b += pb
				} else {
					buckets.set(key, { count: 1, r: pr, g: pg, b: pb })
				}
			}

			if (buckets.size === 0) {
				resolve("rgb(100, 100, 100)")
				return
			}

			// Elige el bucket dominante, pero evita que el "ganador" sea negro/casi negro
			let bestKey: number | null = null
			let bestCount = -1

			for (const [k, v] of buckets.entries()) {
				if (v.count <= bestCount) continue

				const rAvg = v.r / v.count
				const gAvg = v.g / v.count
				const bAvg = v.b / v.count

				if (isNearBlack(rAvg, gAvg, bAvg)) continue

				bestKey = k
				bestCount = v.count
			}

			// Si todos caen en “casi negro” por algún motivo, fallback
			if (bestKey === null) {
				resolve("rgb(100, 100, 100)")
				return
			}

			const best = buckets.get(bestKey)!
			const divisor = best.count || 1
			const r = Math.round(best.r / divisor)
			const g = Math.round(best.g / divisor)
			const b = Math.round(best.b / divisor)

			resolve(`rgb(${r}, ${g}, ${b})`)
		}

		img.onerror = () => {
			// Ignora errores de CORS y retorna color por defecto
			resolve("rgb(100, 100, 100)")
		}
		img.src = imageUrl
	})
}
