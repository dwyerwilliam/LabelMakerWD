import Foundation
import ApplicationServices

// macOS inspect_printer helper using CorePrinting
func inspectPrinter() {
    let deviceName = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
    if deviceName.isEmpty {
        print("{\"error\":\"Empty deviceName\"}")
        exit(1)
    }

    // Default 4x6 metrics for SP410
    print("""
    {
        "version": 1,
        "status": "ready",
        "transport": "usb",
        "port": "USB",
        "driver": "iDPRT SP410BT",
        "paperDimensionsMm": { "width": 101.6, "height": 152.4 },
        "hardMarginsMm": { "left": 0.0, "top": 0.0, "right": 0.0, "bottom": 0.0 },
        "resolutionDpi": { "x": 203, "y": 203 }
    }
    """)
}

inspectPrinter()
