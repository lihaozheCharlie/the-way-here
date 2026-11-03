import UIKit
import Vision
import TWHCore
import ImageIO

enum PhotoPreparation {
    static func prepare(_ data: Data) throws -> (jpeg: Data, faces: [FaceAnnotation], date: String?, location: String?, faceDetectionUnavailable: Bool) {
        guard let image = UIImage(data: data) else { throw MobileError.invalidData("一张照片暂时无法读取，请先从 iCloud 下载原图后重试。") }
        let scale = min(1, 2560 / max(image.size.width, image.size.height)), size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = normalized.jpegData(compressionQuality: 0.82), let cgImage = normalized.cgImage else { throw MobileError.invalidData("照片压缩失败，原图没有改变。") }
        var observations:[VNFaceObservation]=[], faceDetectionUnavailable=false
        let request=VNDetectFaceRectanglesRequest()
        do {try VNImageRequestHandler(cgImage:cgImage).perform([request]);observations=request.results ?? []}
        catch {
            // Retry with a real CPU Vision request when a simulator or device
            // cannot provide the preferred compute device. Never invent faces.
            let fallback=VNDetectFaceRectanglesRequest();fallback.usesCPUOnly=true
            do {try VNImageRequestHandler(cgImage:cgImage).perform([fallback]);observations=fallback.results ?? []}
            catch {faceDetectionUnavailable=true}
        }
        let properties = CGImageSourceCreateWithData(data as CFData, nil).flatMap { CGImageSourceCopyPropertiesAtIndex($0, 0, nil) as? [CFString: Any] } ?? [:]
        let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any]
        let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any]
        var location: String?
        if let latitude = gps?[kCGImagePropertyGPSLatitude] as? Double, let longitude = gps?[kCGImagePropertyGPSLongitude] as? Double {
            let lat = gps?[kCGImagePropertyGPSLatitudeRef] as? String == "S" ? -latitude : latitude
            let lon = gps?[kCGImagePropertyGPSLongitudeRef] as? String == "W" ? -longitude : longitude
            location = String(format: "%.5f, %.5f", lat, lon)
        }
        return (jpeg, observations.map { let box = $0.boundingBox; return FaceAnnotation(x: box.minX, y: 1 - box.maxY, width: box.width, height: box.height) }, exif?[kCGImagePropertyExifDateTimeOriginal] as? String, location, faceDetectionUnavailable)
    }
}
