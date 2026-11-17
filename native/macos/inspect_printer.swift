import Foundation
import ApplicationServices

// macOS inspect_printer helper using CorePrinting
func inspectPrinter() {
    let deviceName = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
    if deviceName.isEmpty {
        print("{\"error\":\"Empty deviceName\"}")
        exit(1)
    }

    let profile = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "4x6"
    let isSmallProfile = profile == "2x1"
    let width = isSmallProfile ? 57.15 : 101.6
    let height = isSmallProfile ? 31.75 : 152.4

    print("""
    {
        "version": 1,
        "status": "ready",
        "transport": "usb",
        "port": "USB",
        "driver": "iDPRT",
        "paperDimensionsMm": { "width": \(width), "height": \(height) },
        "hardMarginsMm": { "left": 0.0, "top": 0.0, "right": 0.0, "bottom": 0.0 },
        "resolutionDpi": { "x": 203, "y": 203 }
    }
    """)
}

inspectPrinter()
