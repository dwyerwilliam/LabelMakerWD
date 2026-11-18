import Foundation
import ApplicationServices
import IOKit

// macOS inspect_printer helper.
//
// Reports the real state of a CUPS queue instead of assuming it is ready:
//   - the queue state (idle / processing / stopped) and state reasons from CUPS
//   - the connection type from the queue's device URI
//   - for usb:// queues, whether a matching USB device is actually attached.
//     CUPS keeps a USB queue "idle" after the printer is unplugged, so the
//     queue state alone cannot tell a connected printer from a missing one.

func jsonString(_ s: String) -> String {
    let data = try? JSONSerialization.data(withJSONObject: [s], options: [])
    let wrapped = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
    return String(wrapped.dropFirst().dropLast())
}

func fail(_ message: String) -> Never {
    print("{\"error\":\(jsonString(message))}")
    exit(1)
}

// MARK: - CUPS (loaded at run time; libcups has no Swift module)

typealias CupsGetNamedDest = @convention(c) (OpaquePointer?, UnsafePointer<CChar>, UnsafePointer<CChar>?) -> UnsafeMutableRawPointer?
typealias CupsGetOption = @convention(c) (UnsafePointer<CChar>, Int32, UnsafeMutableRawPointer?) -> UnsafePointer<CChar>?
typealias CupsFreeDests = @convention(c) (Int32, UnsafeMutableRawPointer?) -> Void

/// The queue's CUPS options (printer-state, printer-state-reasons, device-uri, ...), or nil if the queue does not exist.
func cupsOptions(for queue: String, keys: [String]) -> [String: String]? {
    guard let lib = dlopen("/usr/lib/libcups.2.dylib", RTLD_NOW),
          let getDestSym = dlsym(lib, "cupsGetNamedDest"),
          let getOptionSym = dlsym(lib, "cupsGetOption"),
          let freeSym = dlsym(lib, "cupsFreeDests") else {
        return [:]
    }
    let getDest = unsafeBitCast(getDestSym, to: CupsGetNamedDest.self)
    let getOption = unsafeBitCast(getOptionSym, to: CupsGetOption.self)
    let freeDests = unsafeBitCast(freeSym, to: CupsFreeDests.self)

    guard let dest = getDest(nil, queue, nil) else { return nil }
    defer { freeDests(1, dest) }

    // cups_dest_t { char *name; char *instance; int is_default; int num_options; cups_option_t *options; }
    let ptr = MemoryLayout<UnsafeRawPointer>.size
    let numOptions = dest.load(fromByteOffset: ptr * 2 + 4, as: Int32.self)
    let options = dest.load(fromByteOffset: ptr * 2 + 8, as: UnsafeMutableRawPointer?.self)

    var result: [String: String] = [:]
    for key in keys {
        if let value = getOption(key, numOptions, options) {
            result[key] = String(cString: value)
        }
    }
    return result
}

// MARK: - USB presence

struct UsbDevice {
    let product: String
    let vendor: String
    let serial: String
}

func attachedUsbDevices() -> [UsbDevice] {
    var devices: [UsbDevice] = []
    for className in ["IOUSBHostDevice", "IOUSBDevice"] {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching(className), &iterator) == KERN_SUCCESS else { continue }
        defer { IOObjectRelease(iterator) }
        var service = IOIteratorNext(iterator)
        while service != 0 {
            func prop(_ key: String) -> String {
                (IORegistryEntryCreateCFProperty(service, key as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue() as? String) ?? ""
            }
            devices.append(UsbDevice(product: prop("USB Product Name"), vendor: prop("USB Vendor Name"), serial: prop("USB Serial Number")))
            IOObjectRelease(service)
            service = IOIteratorNext(iterator)
        }
    }
    return devices
}

/// Whether the printer named by a CUPS usb:// URI (usb://Make/Model?serial=XYZ) is plugged in.
func isUsbPrinterAttached(uri: String) -> Bool {
    guard let components = URLComponents(string: uri) else { return false }
    let serial = components.queryItems?.first(where: { $0.name == "serial" })?.value ?? ""
    let model = (components.path.removingPercentEncoding ?? components.path)
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let normalize = { (s: String) in s.lowercased().filter { $0.isLetter || $0.isNumber } }

    return attachedUsbDevices().contains { device in
        if !serial.isEmpty {
            return device.serial == serial
        }
        return !model.isEmpty && normalize(device.product).contains(normalize(model))
    }
}

// MARK: - Main

func transport(forUri uri: String) -> String {
    let scheme = uri.split(separator: ":").first.map { $0.lowercased() } ?? ""
    switch scheme {
    case "usb": return "usb"
    case "bluetooth", "bt", "btspp": return "bluetooth"
    case "ipp", "ipps", "ipp14", "http", "https", "socket", "lpd", "dnssd", "mdns", "smb", "ncp": return "network"
    default: return "unknown"
    }
}

func inspectPrinter() {
    let deviceName = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
    if deviceName.isEmpty { fail("Empty deviceName") }

    let profile = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "4x6"
    let isSmallProfile = profile == "2x1"
    let width = isSmallProfile ? 57.15 : 101.6
    let height = isSmallProfile ? 31.75 : 152.4

    guard let options = cupsOptions(for: deviceName, keys: ["printer-state", "printer-state-reasons", "device-uri", "printer-is-accepting-jobs"]) else {
        fail("No such print queue")
    }

    let deviceUri = options["device-uri"] ?? ""
    let queueTransport = transport(forUri: deviceUri)
    let reasons = (options["printer-state-reasons"] ?? "")
        .split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
        .filter { !$0.isEmpty && $0 != "none" }

    var status = "ready"
    if options.isEmpty || deviceUri.isEmpty {
        status = "unknown"
    } else if queueTransport == "usb" && !isUsbPrinterAttached(uri: deviceUri) {
        status = "offline"
    } else if options["printer-state"] == "5" || options["printer-is-accepting-jobs"] == "false" || reasons.contains(where: { $0.hasPrefix("paused") }) {
        status = "paused"
    } else if reasons.contains(where: { $0.hasSuffix("-error") }) {
        status = "error"
    } else if reasons.contains(where: { $0.hasPrefix("offline") }) && queueTransport != "usb" {
        // For USB queues the attachment check above is authoritative; CUPS leaves
        // offline-report set on USB queues long after the printer is reconnected.
        status = "offline"
    }

    print("""
    {
        "version": 1,
        "status": "\(status)",
        "transport": "\(queueTransport)",
        "paperDimensionsMm": { "width": \(width), "height": \(height) },
        "hardMarginsMm": { "left": 0.0, "top": 0.0, "right": 0.0, "bottom": 0.0 },
        "resolutionDpi": { "x": 203, "y": 203 }
    }
    """)
}

inspectPrinter()
