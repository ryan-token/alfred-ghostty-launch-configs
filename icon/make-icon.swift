// Draws icon.png. Run with: swift icon/make-icon.swift
//
// The icon is generated rather than hand-drawn so the geometry stays exact and the
// artwork can be re-rendered at any size without a binary editor in the loop.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size = 512.0
let scale = size / 1024.0

func px(_ value: Double) -> Double { value * scale }

func rgb(_ hex: UInt32, _ alpha: Double = 1) -> CGColor {
    CGColor(
        red: Double((hex >> 16) & 0xFF) / 255,
        green: Double((hex >> 8) & 0xFF) / 255,
        blue: Double(hex & 0xFF) / 255,
        alpha: alpha
    )
}

let space = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CGContext(
    data: nil,
    width: Int(size),
    height: Int(size),
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: space,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
)!

context.setAllowsAntialiasing(true)
context.interpolationQuality = .high

func roundedRect(_ rect: CGRect, _ radius: Double) -> CGPath {
    CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
}

func fillGradient(path: CGPath, from top: CGColor, to bottom: CGColor) {
    context.saveGState()
    context.addPath(path)
    context.clip()
    let gradient = CGGradient(
        colorsSpace: space,
        colors: [top, bottom] as CFArray,
        locations: [0, 1]
    )!
    let box = path.boundingBox
    context.drawLinearGradient(
        gradient,
        start: CGPoint(x: box.midX, y: box.maxY),
        end: CGPoint(x: box.midX, y: box.minY),
        options: []
    )
    context.restoreGState()
}

// Bezel: Apple's continuous-corner ratio, so it sits correctly beside real app icons.
let bezel = CGRect(x: 0, y: 0, width: size, height: size)
let bezelPath = roundedRect(bezel, size * 0.2237)
fillGradient(path: bezelPath, from: rgb(0x2A2C33), to: rgb(0x0E0F12))

// Screen
let inset = px(84)
let screen = bezel.insetBy(dx: inset, dy: inset)
let screenPath = roundedRect(screen, px(120))
fillGradient(path: screenPath, from: rgb(0x14235E), to: rgb(0x0A0F2E))

context.saveGState()
context.addPath(screenPath)
context.clip()

// Glow behind the panes, brightest at the prompt, echoing a lit CRT.
let glow = CGGradient(
    colorsSpace: space,
    colors: [rgb(0x2E5BFF, 0.55), rgb(0x2E5BFF, 0)] as CFArray,
    locations: [0, 1]
)!
context.drawRadialGradient(
    glow,
    startCenter: CGPoint(x: screen.minX + screen.width * 0.34, y: screen.midY),
    startRadius: 0,
    endCenter: CGPoint(x: screen.minX + screen.width * 0.34, y: screen.midY),
    endRadius: screen.width * 0.62,
    options: []
)

let pad = px(96)
let gutter = px(44)
let content = screen.insetBy(dx: pad, dy: pad)
let leftWidth = (content.width - gutter) * 0.54
let rightWidth = content.width - gutter - leftWidth
let rightHeight = (content.height - gutter) / 2
let rightX = content.minX + leftWidth + gutter
let paneRadius = px(26)

let panes = [
    CGRect(x: content.minX, y: content.minY, width: leftWidth, height: content.height),
    CGRect(x: rightX, y: content.minY + rightHeight + gutter, width: rightWidth, height: rightHeight),
    CGRect(x: rightX, y: content.minY, width: rightWidth, height: rightHeight),
]

context.setLineWidth(px(22))
context.setStrokeColor(rgb(0xD6E4FF))
context.setShadow(offset: .zero, blur: px(30), color: rgb(0x6E9BFF, 0.85))

for (index, pane) in panes.enumerated() {
    let path = roundedRect(pane, paneRadius)
    context.addPath(path)
    context.setFillColor(rgb(0x6E9BFF, index == 0 ? 0.16 : 0.09))
    context.fillPath()
    context.addPath(path)
    context.strokePath()
}

// Prompt mark: chevron plus cursor, sized to stay legible when the icon is 32pt.
let markHeight = px(150)
let cursorWidth = px(96)
let markWidth = markHeight * 0.78 + cursorWidth
let markX = panes[0].midX - markWidth / 2
let markY = panes[0].midY

context.setLineWidth(px(30))
context.setLineCap(.round)
context.setLineJoin(.round)
context.beginPath()
context.move(to: CGPoint(x: markX, y: markY + markHeight / 2))
context.addLine(to: CGPoint(x: markX + markHeight * 0.52, y: markY))
context.addLine(to: CGPoint(x: markX, y: markY - markHeight / 2))
context.strokePath()

let cursor = CGRect(
    x: markX + markHeight * 0.78,
    y: markY - markHeight / 2,
    width: cursorWidth,
    height: px(30)
)
context.addPath(roundedRect(cursor, px(15)))
context.setFillColor(rgb(0xD6E4FF))
context.fillPath()

context.restoreGState()

// Inner lip separating screen from bezel.
context.addPath(screenPath)
context.setStrokeColor(rgb(0x000000, 0.55))
context.setLineWidth(px(10))
context.strokePath()

let output = URL(fileURLWithPath: "icon.png")
let destination = CGImageDestinationCreateWithURL(
    output as CFURL, UTType.png.identifier as CFString, 1, nil
)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
guard CGImageDestinationFinalize(destination) else {
    FileHandle.standardError.write(Data("failed to write \(output.path)\n".utf8))
    exit(1)
}
print("wrote \(output.path) at \(Int(size))×\(Int(size))")
