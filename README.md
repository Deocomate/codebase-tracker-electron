# 📂 Codebase Tracker

**Codebase Tracker** là một ứng dụng Desktop mạnh mẽ được xây dựng bằng Electron, React và Vite. Ứng dụng giúp bạn gom nhóm, tối ưu và trích xuất mã nguồn của dự án thành các tệp văn bản duy nhất để dễ dàng cung cấp bối cảnh (context) cho các công cụ AI (như ChatGPT, Claude, Gemini).

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Electron](https://img.shields.io/badge/Electron-39.2.6-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4.2-38B2AC?logo=tailwind-css&logoColor=white)

## ✨ Tính năng nổi bật

- 🌳 **Cây thư mục trực quan (Tree View):** Quản lý, chọn/bỏ chọn các file và thư mục muốn trích xuất trực tiếp trên giao diện.
- 🖱️ **Kéo thả thông minh:** Kéo thả (Drag & Drop) để sắp xếp lại thứ tự ưu tiên của các file/thư mục khi gom mã nguồn (sử dụng `@dnd-kit`).
- 🤖 **Bộ lọc thông minh:** Tự động nhận diện và bỏ qua các tệp không cần thiết (kế thừa từ `.gitignore` và các mẫu cấu hình toàn cục như `node_modules`, `venv`, `dist`, v.v.).
- 📑 **Đa định dạng xuất:** Hỗ trợ xuất mã nguồn dưới nhiều dạng: `TXT`, `JSON`, `Markdown (MD)`, và `XML`.
- ✂️ **Tự động chia nhỏ tệp (Chunk Splitting):** Hỗ trợ chia nhỏ đầu ra thành nhiều phần (parts) để tránh vượt quá giới hạn Token của các mô hình AI.
- 📋 **Auto Copy:** Tự động copy toàn bộ nội dung đã gom vào Clipboard chỉ với một nút bấm.

## 🛠️ Công nghệ sử dụng

- **Core:** [Electron](https://www.electronjs.org/) (Main/Renderer Process IPC qua ContextBridge).
- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/).
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) & [Lucide React](https://lucide.dev/) (Icons).
- **Build Tool:** [Electron-Vite](https://electron-vite.org/) & [Vite](https://vitejs.dev/).

## 🚀 Hướng dẫn cài đặt

### Yêu cầu hệ thống
- [Node.js](https://nodejs.org/) (Phiên bản v18 trở lên).
- npm, yarn hoặc pnpm.

### Cài đặt và Chạy thử (Development)

1. Clone kho lưu trữ về máy:
   ```bash
   git clone <repository-url>
   cd codebase-tracker-electron
   ```

2. Cài đặt các thư viện phụ thuộc:
   ```bash
   npm install
   ```

3. Khởi chạy môi trường phát triển:
   ```bash
   npm run dev
   ```

## 📦 Đóng gói ứng dụng (Build)

Dự án hỗ trợ đóng gói trên nhiều hệ điều hành khác nhau nhờ `electron-builder`.

- **Build cho Windows:**
  ```bash
  npm run build:win
  ```
- **Build cho macOS:**
  ```bash
  npm run build:mac
  ```
- **Build cho Linux:**
  ```bash
  npm run build:linux
  ```

*Tệp cài đặt đầu ra sẽ nằm trong thư mục `dist/`.*

## 📖 Hướng dẫn sử dụng

1. **Tải dự án:** Kéo thả thư mục dự án của bạn vào cửa sổ ứng dụng hoặc bấm `Browse...`.
2. **Chọn lọc mã nguồn:** Tích hoặc bỏ tích các tệp/thư mục bạn không muốn AI đọc. Bạn có thể kéo thả các nút trong cây để ưu tiên thư mục nào được đọc trước.
3. **Cấu hình xuất:**
   - Chọn định dạng xuất (TXT, MD, JSON, XML).
   - Bật/Tắt tính năng chia nhỏ tệp (Split) và nhập số lượng phần nếu mã nguồn quá lớn.
4. **Xử lý:** Bấm **Scan & Generate**.
5. **Hoàn tất:** Các file tổng hợp sẽ được lưu tại thư mục `_codebase/` nằm bên trong dự án của bạn. Bấm **Auto Copy** để dán thẳng vào ChatGPT/Claude.

## 📂 Cấu trúc thư mục

```text
.
├── resources/           # Icon ứng dụng (ico, icns, png)
├── src/
│   ├── main/            # Electron Main Process (xử lý file, logic gom file, IPC)
│   │   ├── core/        # Core logic: formatters, scanner, treeBuilder,...
│   │   ├── index.ts     # Entry point của Main process
│   │   └── ipcHandlers.ts # Cầu nối IPC giao tiếp với Renderer
│   ├── preload/         # Electron Preload Scripts (ContextBridge)
│   └── renderer/        # Giao diện React
│       ├── src/         # Các Component (App, TreeView), CSS, Types
│       └── index.html   # Entry point của Renderer
├── electron-builder.yml # Cấu hình đóng gói ứng dụng
└── electron.vite.config.ts # Cấu hình Vite & Electron
```

## 📝 Giấy phép (License)
Dự án được tạo bởi [Minh Long]. Bạn có thể tuỳ chỉnh theo nhu cầu.