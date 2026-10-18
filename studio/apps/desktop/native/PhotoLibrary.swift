import AppKit
import Photos
import CoreLocation

// Read-only PhotoKit bridge. Keep the main run loop alive for authorization and
// PhotoKit/geocoder callbacks; enumerate metadata away from the UI thread.
let outputLock = NSLock()
let work = DispatchQueue(label: "com.thewayhere.photos.search")
let imageManager = PHCachingImageManager()
let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

func respond(_ id: String, _ result: Any? = nil, error: String? = nil) {
    var value: [String: Any] = ["id": id]
    if let error = error { value["error"] = error } else { value["result"] = result ?? NSNull() }
    guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
    outputLock.lock(); defer { outputLock.unlock() }
    FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
}
func authorization() -> String {
    switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
    case .notDetermined: return "notDetermined"
    case .authorized, .limited: return "authorized"
    case .denied: return "denied"
    default: return "restricted"
    }
}
func requireAccess(_ id: String) -> Bool {
    guard authorization() == "authorized" else {
        sessions.removeAll(); sessionOrder.removeAll()
        imageManager.stopCachingImagesForAllAssets()
        respond(id, error: "照片库访问未获授权，请在系统设置 → 隐私与安全性 → 照片中允许访问。")
        return false
    }
    return true
}
final class Search {
    let assets: PHFetchResult<PHAsset>
    let keyword: String
    let albumIDs: Set<String>
    let center: CLLocation?
    let summary: String
    let place: [String: Any]?
    var offset = 0
    var issued = Set<String>()
    init(assets: PHFetchResult<PHAsset>, keyword: String, albumIDs: Set<String>, center: CLLocation?, summary: String, place: [String: Any]?) {
        self.assets = assets; self.keyword = keyword; self.albumIDs = albumIDs
        self.center = center; self.summary = summary; self.place = place
    }
}
var sessions = [String: Search]()
var sessionOrder = [String]()

func filename(_ asset: PHAsset) -> String {
    PHAssetResource.assetResources(for: asset).first(where: { $0.type == .photo || $0.type == .fullSizePhoto })?.originalFilename ?? "照片"
}
func page(_ id: String, token: String, search: Search) {
    var photos = [[String: Any]]()
    while search.offset < search.assets.count && photos.count < 36 {
        let asset = search.assets.object(at: search.offset); search.offset += 1
        autoreleasepool {
            if let center = search.center {
                guard let location = asset.location, location.distance(from: center) <= 30_000 else { return }
            }
            let name = filename(asset)
            if search.center == nil && !search.keyword.isEmpty && !search.albumIDs.contains(asset.localIdentifier) && !name.localizedStandardContains(search.keyword) { return }
            var photo: [String: Any] = ["id": asset.localIdentifier, "name": name, "hasLocation": asset.location != nil, "width": asset.pixelWidth, "height": asset.pixelHeight]
            if let date = asset.creationDate { photo["createdAt"] = iso.string(from: date) }
            photos.append(photo); search.issued.insert(asset.localIdentifier)
        }
    }
    var result: [String: Any] = ["photos": photos, "summary": search.summary]
    if search.offset < search.assets.count { result["nextCursor"] = token }
    if let place = search.place { result["place"] = place }
    guard requireAccess(id) else { return }
    respond(id, result)
}
func beginSearch(_ id: String, input: [String: Any], center: CLLocation? = nil, place: [String: Any]? = nil) {
    work.async {
        guard requireAccess(id) else { return }
        let keyword = input["keyword"] as? String ?? ""
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.includeHiddenAssets = false
        var predicates = [NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)]
        for key in ["start", "end"] {
            if let raw = input[key] as? String {
                guard let date = iso.date(from: raw) else { respond(id, error: "日期条件无效"); return }
                predicates.append(NSPredicate(format: key == "start" ? "creationDate >= %@" : "creationDate < %@", date as NSDate))
            }
        }
        options.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        var albumIDs = Set<String>()
        if center == nil && !keyword.isEmpty {
            let albums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
            albums.enumerateObjects { album, _, _ in
                if album.localizedTitle?.localizedStandardContains(keyword) == true {
                    PHAsset.fetchAssets(in: album, options: options).enumerateObjects { asset, _, _ in albumIDs.insert(asset.localIdentifier) }
                }
            }
        }
        let search = Search(assets: PHAsset.fetchAssets(with: options), keyword: keyword, albumIDs: albumIDs, center: center, summary: input["summary"] as? String ?? "全部日期", place: place)
        let token = UUID().uuidString
        sessions[token] = search; sessionOrder.append(token)
        while sessionOrder.count > 4 { sessions.removeValue(forKey: sessionOrder.removeFirst()) }
        page(id, token: token, search: search)
    }
}
// Keep geocoders alive until their completion. Address lookup never asks for
// the device's current location and never sends photo coordinates to geocoding.
var geocoders = [String: CLGeocoder]()
func search(_ id: String, input: [String: Any]) {
    guard authorization() == "authorized" else { respond(id, error: "请先允许访问照片库"); return }
    if input["kind"] as? String != "place" { beginSearch(id, input: input); return }
    let geocoder = CLGeocoder(); geocoders[id] = geocoder
    geocoder.geocodeAddressString(input["keyword"] as? String ?? "", in: nil, preferredLocale: Locale(identifier: "zh_CN")) { places, error in
        geocoders.removeValue(forKey: id)
        guard error == nil, let places = places, let first = places.first, let location = first.location else {
            respond(id, error: "未能定位这个地点，请联网后使用更完整的地名，例如“浙江杭州富阳”。"); return
        }
        if places.count > 1 {
            respond(id, error: "这个地名对应多个地点，请加上省市或具体地址后重试。"); return
        }
        let name = [first.administrativeArea, first.locality, first.subLocality, first.name].compactMap { $0 }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }.joined(separator: " · ")
        beginSearch(id, input: input, center: location, place: ["name": name, "latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "radiusKm": 30])
    }
}
func image(_ id: String, input: [String: Any]) {
    work.async {
        guard requireAccess(id), let assetID = input["assetId"] as? String else { return }
        guard sessions.values.contains(where: { $0.issued.contains(assetID) }) else { respond(id, error: "照片结果已过期，请重新搜索"); return }
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [assetID], options: nil).firstObject else { respond(id, error: "这张照片已移除或暂时不可用"); return }
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = input["network"] as? Bool == true
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        let side = input["size"] as? String == "preview" ? 1600 : 360
        imageManager.requestImage(for: asset, targetSize: CGSize(width: side, height: side), contentMode: .aspectFit, options: options) { image, info in
            if info?[PHImageResultIsDegradedKey] as? Bool == true { return }
            guard authorization() == "authorized" else { respond(id, error: "照片库授权已撤回"); return }
            guard let image = image, let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                if info?[PHImageResultIsInCloudKey] as? Bool == true && !options.isNetworkAccessAllowed { respond(id, ["cloudOnly": true]); return }
                respond(id, error: "照片暂时无法读取，请检查网络或在系统照片中下载后重试。"); return
            }
            // Re-encode a bounded image: no GPS/EXIF and no original-file copy.
            let longest = max(cgImage.width, cgImage.height)
            let scale = min(1, Double(side) / Double(max(1, longest)))
            let width = max(1, Int(Double(cgImage.width) * scale)), height = max(1, Int(Double(cgImage.height) * scale))
            guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { respond(id, error: "无法生成照片预览"); return }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            guard let resized = context.makeImage(), let data = NSBitmapImageRep(cgImage: resized).representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else { respond(id, error: "无法生成照片预览"); return }
            respond(id, ["dataUrl": "data:image/jpeg;base64," + data.base64EncodedString(), "cloudOnly": false])
        }
    }
}
func receive(_ input: [String: Any]) {
    guard let id = input["id"] as? String else { return }
    switch input["command"] as? String {
    case "status":
        let status = authorization()
        if status != "authorized" { work.async { sessions.removeAll(); sessionOrder.removeAll(); imageManager.stopCachingImagesForAllAssets() } }
        respond(id, status)
    case "authorize": PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in respond(id, authorization()) }
    case "search": search(id, input: input)
    case "more": work.async {
        guard requireAccess(id) else { return }
        guard let token = input["cursor"] as? String, let current = sessions[token] else { respond(id, error: "照片分页已失效，请重新搜索"); return }
        page(id, token: token, search: current)
    }
    case "image": image(id, input: input)
    default: respond(id, error: "未知照片操作")
    }
}
DispatchQueue.global().async {
    while let line = readLine() {
        guard line.utf8.count < 4096, let data = line.data(using: .utf8), let input = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
        DispatchQueue.main.async { receive(input) }
    }
    exit(0)
}
RunLoop.main.run()
