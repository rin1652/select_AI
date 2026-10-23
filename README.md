# Select Dictionary

Extension cho trình duyệt Chromium (Chrome, Brave, Edge…): **bôi đen một câu hỏi là AI trả lời ngắn gọn ngay trên trang**. Trang nào chặn bôi đen thì dùng **phím tắt để chụp vùng câu hỏi**, AI sẽ đọc ảnh và trả lời.

## Tính năng

- **Bôi đen → đáp án:** bôi đen câu hỏi (kèm các lựa chọn A/B/C/D nếu có), popup hiện đáp án ngắn gọn ngay bên dưới.
- **Option/Alt + click:** bôi đen nguyên thẻ câu hỏi chỉ với một click.
- **Chụp câu hỏi bằng phím tắt:** bấm phím tắt rồi click (chụp cả màn hình) hoặc kéo chuột quanh câu hỏi, AI đọc ảnh và trả lời. Cách này vẫn dùng được khi trang chặn bôi đen.
- **Mở khoá bôi đen / copy / chuột phải** trên các trang chặn những thao tác này. Có thể tắt trong cài đặt.
- **Hai nhà cung cấp AI:** OpenAI hoặc Google Gemini, tự chọn model, tự sửa system prompt.
- **Chế độ từ điển:** nếu chưa nhập API key, bôi đen một từ tiếng Anh sẽ hiện nghĩa, phiên âm, nút phát âm và bản dịch tiếng Việt.

## Cài đặt

Extension chưa có trên Chrome Web Store, nên cài thủ công theo cách dưới đây. Mac và Windows cài giống nhau.

### 1. Tải về

Chọn một trong hai cách:

- **Tải file zip:** tải [`select-dictionary.zip`](https://github.com/rin1652/select_AI/raw/main/dist/select-dictionary.zip) (dùng chung cho macOS và Windows), rồi giải nén.
- **Clone repo:**
  ```bash
  git clone https://github.com/rin1652/select_AI.git
  ```

Sau bước này bạn có một thư mục tên **`select-dictionary`** bên trong có file `manifest.json`.

> ⚠️ Hãy để thư mục này ở chỗ cố định (ví dụ Documents). Trình duyệt đọc code trực tiếp từ thư mục này, nên nếu xoá hoặc di chuyển nó thì extension sẽ ngừng chạy.

### 2. Nạp extension vào trình duyệt

1. Mở trang quản lý extension:

   | Trình duyệt | Địa chỉ |
   | --- | --- |
   | Brave | `brave://extensions` |
   | Chrome | `chrome://extensions` |
   | Edge | `edge://extensions` |

2. Bật **Developer mode** (góc trên bên phải; trên Edge thì ở cột bên trái).
3. Bấm **Load unpacked**.
4. Chọn thư mục **`select-dictionary`**, tức là thư mục chứa file `manifest.json`, không phải thư mục cha bên ngoài.
5. Bấm biểu tượng mảnh ghép 🧩 trên thanh công cụ và ghim **Select Dictionary** ra ngoài cho dễ mở.

### 3. Nhập API key

1. Bấm vào icon **Select Dictionary** để mở trang **Cài đặt**.
2. Chọn **Nhà cung cấp**: OpenAI hoặc Google (Gemini).
3. Dán **API key**:
   - OpenAI: lấy tại <https://platform.openai.com/api-keys>
   - Google Gemini: lấy tại <https://aistudio.google.com/apikey>
4. Bấm **Tải danh sách** rồi chọn **Model**. Nên chọn model đọc được ảnh nếu muốn dùng phím tắt chụp, ví dụ `gpt-5-mini`, `gpt-4o-mini`, `gemini-2.5-flash`.
5. Bấm **Lưu**, sau đó bấm **Thử kết nối** để kiểm tra.

> API key chỉ được lưu trong trình duyệt trên máy bạn, không nằm trong code hay file zip.

### 4. Tải lại các tab đang mở

Các tab đã mở từ trước khi cài cần được tải lại (F5) thì tính năng bôi đen mới chạy.

## Cách dùng

### Bôi đen

Bôi đen câu hỏi rồi thả chuột. Popup hiện **"Đang tra…"** và sau vài giây sẽ hiện đáp án.

- Đóng popup: click ra ngoài, nhấn **Esc** hoặc cuộn trang.

### Bôi đen cả thẻ câu hỏi bằng một click

Giữ **Option** (macOS) hoặc **Alt** (Windows) rồi **click** vào bất kỳ chỗ nào trong thẻ câu hỏi: tiêu đề, một đáp án hay khoảng trống. Cả thẻ (câu hỏi và mọi đáp án) sẽ được bôi đen và gửi cho AI ngay. Cú click này không tick vào đáp án và không mở link.
- Bôi đen bằng bàn phím (Shift + phím mũi tên) cũng được.

### Chế độ ẩn

Bật ô **"Chế độ ẩn"** trong Cài đặt thì popup trong suốt hoàn toàn: không nền, không viền, không chữ. Đáp án luôn nằm **ngay dưới chữ vừa bôi đen, thẳng mép trái**, nên muốn xem thì bôi đen vùng trống ngay bên dưới đó (kéo 2–3 dòng là đủ), chữ sẽ hiện lên trong vùng bôi đen.

### Phím tắt chụp câu hỏi

| Hệ điều hành | Phím tắt mặc định |
| --- | --- |
| macOS | **Cmd + Shift + S** |
| Windows | **Ctrl + Shift + S** |

1. Bấm phím tắt. Màn hình giữ nguyên, chỉ có con trỏ chuột chuyển thành dấu **+**.
2. Chọn vùng cần chụp:
   - **Click** một cái: chụp toàn bộ phần đang hiển thị trên màn hình.
   - **Kéo chuột** từ góc này sang góc kia của câu hỏi: chỉ chụp vùng đó. Khi kéo sẽ không hiện khung, nên hãy kéo rộng ra một chút cho chắc.
3. Đợi AI đọc ảnh và hiện đáp án.

Nhấn **Esc** để huỷ.

Muốn đổi phím tắt thì vào trang Cài đặt và bấm **Đổi phím tắt**, hoặc mở `brave://extensions/shortcuts` (Chrome là `chrome://extensions/shortcuts`).

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
| --- | --- |
| Bôi đen không hiện gì | Tải lại trang (F5). Nếu trang mở dạng `file://`, vào **Details** của extension và bật **Allow access to file URLs**. |
| Phím tắt không chạy | Mở trang Cài đặt xem dòng phím tắt. Nếu hiện **"Chưa đặt"** thì phím đang bị trùng với extension hoặc ứng dụng khác: vào trang shortcuts để đặt lại. |
| Popup báo lỗi API | Kiểm tra API key, hạn mức hoặc số dư tài khoản, và tên model. Bấm **Thử kết nối** trong Cài đặt để xem lỗi chi tiết. |
| Phím tắt báo lỗi khi đọc ảnh | Model đang chọn có thể không đọc được ảnh, hãy đổi sang model hỗ trợ ảnh. Ngoài ra không chụp được các trang nội bộ của trình duyệt (`chrome://`, `brave://`, Web Store). |
| Trang bị lỗi giao diện | Tắt ô **"Mở khoá bôi đen, copy và chuột phải"** trong Cài đặt rồi bấm **Lưu**. |
| Brave/Chrome cảnh báo extension ở chế độ developer | Đây là cảnh báo bình thường với extension cài thủ công. Bấm giữ lại, và đừng tắt Developer mode. |

## Cập nhật lên bản mới

1. Thay nội dung thư mục `select-dictionary` bằng bản mới: tải zip mới rồi giải nén đè lên, hoặc chạy `git pull`.
2. Vào trang extensions và bấm nút reload **↻** trên thẻ Select Dictionary.
3. Tải lại các tab đang mở.

Cài đặt và API key vẫn được giữ nguyên. Nếu bạn **Remove** extension rồi cài lại thì sẽ mất cài đặt và phải nhập lại key.

## Quyền riêng tư

- Chữ được bôi đen, hoặc ảnh vùng được chụp, được gửi tới nhà cung cấp AI bạn đã chọn (OpenAI hoặc Google) bằng API key của chính bạn.
- Khi chưa có API key, chữ được bôi đen được gửi tới [dictionaryapi.dev](https://dictionaryapi.dev) và Google Translate để tra từ.
- Extension không có máy chủ riêng và không thu thập dữ liệu.

## Cấu trúc thư mục

```
select-dictionary/
├── manifest.json   # Khai báo extension, quyền, phím tắt
├── background.js   # Gọi API, chụp màn hình, xử lý phím tắt
├── content.js      # Bắt bôi đen, khung chụp, popup đáp án
├── unlock.js       # Mở khoá bôi đen / copy / chuột phải
├── llm.js          # Gọi OpenAI / Gemini (văn bản + ảnh)
├── settings.js     # Giá trị mặc định, system prompt
├── options.html    # Trang cài đặt
└── options.js
```
