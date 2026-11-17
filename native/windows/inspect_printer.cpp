#include <windows.h>
#include <winspool.h>
#include <iostream>
#include <string>

// Simple JSON printer capability inspector for Windows
int wmain(int argc, wchar_t* argv[]) {
    std::wstring deviceName;

    if (argc > 1) {
        deviceName = argv[1];
    } else {
        // Read line from stdin
        std::getline(std::wcin, deviceName);
    }

    // Strip carriage returns or whitespace
    while (!deviceName.empty() && (deviceName.back() == L'\r' || deviceName.back() == L'\n' || deviceName.back() == L' ')) {
        deviceName.pop_back();
    }
    while (!deviceName.empty() && (deviceName.front() == L' ')) {
        deviceName.erase(0, 1);
    }

    if (deviceName.empty()) {
        std::cout << "{\"error\":\"Empty deviceName\"}\n";
        return 1;
    }

    HANDLE hPrinter = NULL;
    if (!OpenPrinterW(const_cast<LPWSTR>(deviceName.c_str()), &hPrinter, NULL)) {
        std::cout << "{\"error\":\"OpenPrinter failed\",\"code\":" << GetLastError() << "}\n";
        return 2;
    }

    DWORD bytesNeeded = 0;
    GetPrinterW(hPrinter, 2, NULL, 0, &bytesNeeded);
    std::string port = "unknown";
    std::string driver = "unknown";
    std::string status = "ready";

    if (bytesNeeded > 0) {
        BYTE* buffer = new BYTE[bytesNeeded];
        if (GetPrinterW(hPrinter, 2, buffer, bytesNeeded, &bytesNeeded)) {
            PRINTER_INFO_2W* pInfo = reinterpret_cast<PRINTER_INFO_2W*>(buffer);
            if (pInfo->pPortName) {
                std::wstring wport(pInfo->pPortName);
                port = std::string(wport.begin(), wport.end());
            }
            if (pInfo->pDriverName) {
                std::wstring wdrv(pInfo->pDriverName);
                driver = std::string(wdrv.begin(), wdrv.end());
            }
            if (pInfo->Status & PRINTER_STATUS_OFFLINE) {
                status = "offline";
            } else if (pInfo->Status & PRINTER_STATUS_PAUSED) {
                status = "paused";
            } else if (pInfo->Status & PRINTER_STATUS_ERROR) {
                status = "error";
            }
        }
        delete[] buffer;
    }
    ClosePrinter(hPrinter);

    HDC hdc = CreateDCW(L"WINSPOOL", deviceName.c_str(), NULL, NULL);
    double widthMm = 101.6;
    double heightMm = 152.4;
    int dpiX = 203;
    int dpiY = 203;
    double leftMarginMm = 0.0;
    double topMarginMm = 0.0;
    double rightMarginMm = 0.0;
    double bottomMarginMm = 0.0;

    if (hdc) {
        dpiX = GetDeviceCaps(hdc, LOGPIXELSX);
        dpiY = GetDeviceCaps(hdc, LOGPIXELSY);

        int horzRes = GetDeviceCaps(hdc, HORZRES);
        int vertRes = GetDeviceCaps(hdc, VERTRES);
        int physWidth = GetDeviceCaps(hdc, PHYSICALWIDTH);
        int physHeight = GetDeviceCaps(hdc, PHYSICALHEIGHT);
        int physOffsetX = GetDeviceCaps(hdc, PHYSICALOFFSETX);
        int physOffsetY = GetDeviceCaps(hdc, PHYSICALOFFSETY);

        if (physWidth > 0 && dpiX > 0) {
            widthMm = (double)physWidth * 25.4 / (double)dpiX;
            leftMarginMm = (double)physOffsetX * 25.4 / (double)dpiX;
            rightMarginMm = (double)(physWidth - physOffsetX - horzRes) * 25.4 / (double)dpiX;
        }
        if (physHeight > 0 && dpiY > 0) {
            heightMm = (double)physHeight * 25.4 / (double)dpiY;
            topMarginMm = (double)physOffsetY * 25.4 / (double)dpiY;
            bottomMarginMm = (double)(physHeight - physOffsetY - vertRes) * 25.4 / (double)dpiY;
        }

        DeleteDC(hdc);
    }

    std::string transport = "unknown";
    std::string lowerPort = port;
    for (char &c : lowerPort) c = tolower(c);
    if (lowerPort.find("usb") != std::string::npos) transport = "usb";
    else if (lowerPort.find("bth") != std::string::npos) transport = "bluetooth";
    else if (lowerPort.find("ip_") != std::string::npos || lowerPort.find("wsd") != std::string::npos) transport = "network";

    std::cout << "{"
              << "\"version\":1,"
              << "\"status\":\"" << status << "\","
              << "\"transport\":\"" << transport << "\","
              << "\"port\":\"" << port << "\","
              << "\"driver\":\"" << driver << "\","
              << "\"paperDimensionsMm\":{\"width\":" << widthMm << ",\"height\":" << heightMm << "},"
              << "\"hardMarginsMm\":{\"left\":" << leftMarginMm << ",\"top\":" << topMarginMm << ",\"right\":" << rightMarginMm << ",\"bottom\":" << bottomMarginMm << "},"
              << "\"resolutionDpi\":{\"x\":" << dpiX << ",\"y\":" << dpiY << "}"
              << "}\n";

    return 0;
}
