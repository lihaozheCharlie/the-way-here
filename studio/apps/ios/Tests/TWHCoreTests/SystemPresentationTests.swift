import XCTest
@testable import TWHCore

final class SystemPresentationTests:XCTestCase {
    private let space="anonymous-system"
    private func project(_ docs:[Document],hidden:Bool=true,read:Set<String>=[],demo:Bool=false)->SystemPresentation {
        SystemPresentation.project(space:space,readOnly:demo,hidePreview:hidden,documents:docs,topics:[MobileSnapshot.Topic(id:"anonymous-topic",title:"Anonymous topic",question:"Fictional private question",reason:"Anonymous fixture",currentUnderstanding:"Fictional",unknown:"Unknown")],readLetterPaths:read)
    }
    func testPrivateSystemPresentationDoesNotExposeAuthoredPreviews() {
        let source=Document(path:"vault/anonymous-system/sources/source.md",markdown:"# Fictional private source",isSource:true)
        let letter=Document(path:"vault/anonymous-system/wiki/letter.md",markdown:"# Fictional private letter",isSource:false,category:"letters")
        let value=project([source,letter])
        XCTAssertEqual(value.widgetTitle,.message("给此刻留一段话"));XCTAssertNil(value.widgetTopic)
        XCTAssertEqual(value.shortcuts.last?.titleKey,"最近一条未读回信");XCTAssertNil(value.shortcuts.last?.subtitle)
        XCTAssertEqual(value.latestUnreadLetterPath,letter.path)
        let visible=project([source,letter],hidden:false)
        XCTAssertEqual(visible.widgetTitle,.authored(source.title));XCTAssertEqual(visible.widgetTopic,"Fictional private question")
        XCTAssertEqual(visible.shortcuts.last?.subtitle,letter.title)
    }
    func testUnreadShortcutTracksNewestUnreadAndDisappearsWhenAllAreRead() {
        let old=Document(path:"vault/anonymous-system/wiki/old.md",markdown:"# Older fictional letter",modifiedAt:Date(timeIntervalSince1970:100),isSource:false,category:"letters")
        let recent=Document(path:"vault/anonymous-system/wiki/recent.md",markdown:"# Recent fictional letter",modifiedAt:Date(timeIntervalSince1970:200),isSource:false,category:"letters")
        let first=project([old,recent]);XCTAssertEqual(first.latestUnreadLetterPath,recent.path);XCTAssertEqual(first.shortcuts.count,4)
        let next=project([recent,old],read:[recent.path]);XCTAssertEqual(next.latestUnreadLetterPath,old.path)
        let allRead=project([old,recent],read:[old.path,recent.path]);XCTAssertNil(allRead.latestUnreadLetterPath)
        XCTAssertEqual(allRead.shortcuts.map(\.action),["record","photos","write"])
        XCTAssertTrue(allRead.shortcuts.allSatisfy{$0.target==nil})
    }
    func testLocalSystemShortcutsExposeOnlyCaptureAndExistingUnreadContent() {
        XCTAssertEqual(project([]).shortcuts.map(\.action), ["record", "photos", "write"])
        let letter = Document(path:"vault/anonymous-system/wiki/letter.md", markdown:"# Existing fictional letter", isSource:false, category:"letters")
        XCTAssertEqual(project([letter]).shortcuts.map(\.action), ["record", "photos", "write", "letter"])
    }
    func testDemoUsesDemoMessageAndAnAuthoredTitleIsNeverReclassifiedAsCopy() {
        let source=Document(path:"vault/anonymous-system/sources/source.md",markdown:"# 给此刻留一段话",isSource:true)
        XCTAssertEqual(project([source],hidden:false).widgetTitle,.authored("给此刻留一段话"))
        XCTAssertEqual(project([source],hidden:false,demo:true).widgetTitle,.message("先看匿名演示故事"))
    }
}
