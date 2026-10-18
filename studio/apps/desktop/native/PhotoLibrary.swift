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
    let orderedAssets: [PHAsset]?
    let allowedIDs: Set<String>?
    let radiusKm: Double
    let center: CLLocation?
    let summary: String
    let place: [String: Any]?
    var count: Int { orderedAssets?.count ?? assets.count }
    func asset(at index: Int) -> PHAsset { orderedAssets?[index] ?? assets.object(at: index) }
    var offset = 0
    var issued = Set<String>()
    init(assets: PHFetchResult<PHAsset>, orderedAssets: [PHAsset]?, allowedIDs: Set<String>?, radiusKm: Double, center: CLLocation?, summary: String, place: [String: Any]?) {
        self.assets = assets; self.orderedAssets = orderedAssets; self.allowedIDs = allowedIDs; self.radiusKm = radiusKm
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
    while search.offset < search.count && photos.count < 36 {
        let asset = search.asset(at: search.offset); search.offset += 1
        autoreleasepool {
            if let allowedIDs = search.allowedIDs, !allowedIDs.contains(asset.localIdentifier) { return }
            if let center = search.center {
                guard let location = asset.location, location.distance(from: center) <= search.radiusKm * 1_000 else { return }
            }
            let name = filename(asset)
            var photo: [String: Any] = ["id": asset.localIdentifier, "name": name, "hasLocation": asset.location != nil, "width": asset.pixelWidth, "height": asset.pixelHeight]
            if let date = asset.creationDate { photo["createdAt"] = iso.string(from: date) }
            photos.append(photo); search.issued.insert(asset.localIdentifier)
        }
    }
    var result: [String: Any] = ["photos": photos, "summary": search.summary]
    if search.offset < search.count { result["nextCursor"] = token }
    if let place = search.place { result["place"] = place }
    guard requireAccess(id) else { return }
    respond(id, result)
}
func beginSearch(_ id: String, input: [String: Any], center: CLLocation? = nil, place: [String: Any]? = nil) {
    work.async {
        guard requireAccess(id) else { return }
        let dateBasis = input["dateBasis"] as? String ?? "taken"
        let dateKey: String
        if dateBasis == "added" {
            if #available(macOS 26, *) { dateKey = "addedDate" }
            else { respond(id, error: "按加入图库时间筛选需要 macOS 26 或更新版本"); return }
        } else { dateKey = "creationDate" }
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.includeHiddenAssets = false
        var predicates = [NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)]
        for key in ["start", "end"] {
            if dateBasis == "taken", let raw = input[key] as? String {
                guard let date = iso.date(from: raw) else { respond(id, error: "日期条件无效"); return }
                predicates.append(NSPredicate(format: key == "start" ? "%K >= %@" : "%K < %@", dateKey, date as NSDate))
            }
        }
        if input["favoritesOnly"] as? Bool == true { predicates.append(NSPredicate(format: "favorite == YES")) }
        let type = input["photoType"] as? String ?? "all"
        let subtypes: [String: PHAssetMediaSubtype] = ["live": .photoLive, "screenshot": .photoScreenshot, "panorama": .photoPanorama, "portrait": .photoDepthEffect]
        if let subtype = subtypes[type] {
            predicates.append(NSPredicate(format: "(mediaSubtypes & %d) != 0", subtype.rawValue))
        }
        var typeCollection: PHAssetCollection?
        var allowedIDs: Set<String>?
        if type == "raw" || type == "burst" {
            typeCollection = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: type == "raw" ? .smartAlbumRAW : .smartAlbumBursts, options: nil).firstObject
            var ids = Set<String>()
            if let collection = typeCollection {
                PHAsset.fetchAssets(in: collection, options: nil).enumerateObjects { asset, _, _ in ids.insert(asset.localIdentifier) }
            }
            allowedIDs = ids
        }
        options.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        let assets: PHFetchResult<PHAsset>
        var albumTitle: String?
        if let albumID = input["albumId"] as? String, !albumID.isEmpty {
            guard let album = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [albumID], options: nil).firstObject,
                  album.assetCollectionType == .album, album.assetCollectionSubtype != .albumCloudShared else { respond(id, error: "这个相册已移除或不可访问，请刷新相册后重试"); return }
            albumTitle = album.localizedTitle ?? "未命名相册"
            assets = PHAsset.fetchAssets(in: album, options: options)
        } else if type == "raw" || type == "burst" {
            assets = typeCollection.map { PHAsset.fetchAssets(in: $0, options: options) } ?? PHAsset.fetchAssets(withLocalIdentifiers: [], options: options)
            allowedIDs = nil
        } else { assets = PHAsset.fetchAssets(with: options) }
        // Read addedDate through its public property. Property availability alone
        // does not establish support as a PHFetchOptions predicate/sort key.
        var orderedAssets: [PHAsset]?
        if dateBasis == "added", #available(macOS 26, *) {
            let start = (input["start"] as? String).flatMap { iso.date(from: $0) }
            let end = (input["end"] as? String).flatMap { iso.date(from: $0) }
            var matched = [PHAsset]()
            assets.enumerateObjects { asset, _, _ in
                if let start = start, asset.addedDate < start { return }
                if let end = end, asset.addedDate >= end { return }
                if let ids = allowedIDs, !ids.contains(asset.localIdentifier) { return }
                matched.append(asset)
            }
            matched.sort { $0.addedDate == $1.addedDate ? $0.localIdentifier < $1.localIdentifier : $0.addedDate > $1.addedDate }
            orderedAssets = matched
        }
        let summary = (input["summary"] as? String ?? "全部日期") + (albumTitle.map { " · 相册：" + $0 } ?? "")
        let search = Search(assets: assets, orderedAssets: orderedAssets, allowedIDs: allowedIDs, radiusKm: input["radiusKm"] as? Double ?? 30, center: center, summary: summary, place: place)
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
    if (input["place"] as? String ?? "").isEmpty { beginSearch(id, input: input); return }
    let geocoder = CLGeocoder(); geocoders[id] = geocoder
    geocoder.geocodeAddressString(input["place"] as? String ?? "", in: nil, preferredLocale: Locale(identifier: "zh_CN")) { places, error in
        geocoders.removeValue(forKey: id)
        guard error == nil, let places = places, let first = places.first, let location = first.location else {
            respond(id, error: "未能定位这个地点，请联网后使用更完整的地名，例如“浙江杭州富阳”。"); return
        }
        if places.count > 1 {
            respond(id, error: "这个地名对应多个地点，请加上省市或具体地址后重试。"); return
        }
        let name = [first.administrativeArea, first.locality, first.subLocality, first.name].compactMap { $0 }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }.joined(separator: " · ")
        beginSearch(id, input: input, center: location, place: ["name": name, "latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "radiusKm": input["radiusKm"] as? Double ?? 30])
    }
}
func filters(_ id: String) {
    work.async {
        guard requireAccess(id) else { return }
        var albums = [[String: String]]()
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil).enumerateObjects { album, _, _ in
            // Shared albums have a separate scope; expose regular user albums here.
            if album.assetCollectionSubtype != .albumCloudShared {
                albums.append(["id": album.localIdentifier, "title": album.localizedTitle ?? "未命名相册"])
            }
        }
        albums.sort { ($0["title"] ?? "").localizedStandardCompare($1["title"] ?? "") == .orderedAscending }
        let supportsAddedDate: Bool
        if #available(macOS 26, *) { supportsAddedDate = true } else { supportsAddedDate = false }
        guard requireAccess(id) else { return }
        respond(id, ["albums": albums, "supportsAddedDate": supportsAddedDate])
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
    case "filters": filters(id)
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
