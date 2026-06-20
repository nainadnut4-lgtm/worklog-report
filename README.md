# Worklog Boss View

ปฏิทินรายเดือน worklog พนักงาน — เข้ารหัสฝั่ง client, โฮสต์บน GitHub Pages

---

## Flow ทั้งหมด (end-to-end)

```
[แอป Daily Worklog บน iPhone]
        │
        │  ปุ่ม "ส่งให้หัวหน้า" → Export JSON
        ↓
worklog-YYYY-MM.json  (plaintext, อยู่ใน Files / AirDrop)
        │
        │  AirDrop → Mac
        ↓
WORKLOG_PASS="<รหัสแข็ง>" node scripts/encrypt.mjs worklog-YYYY-MM.json
        │
        │  สร้าง data/worklog.enc (ciphertext ปลอดภัย commit ได้)
        │  ลบ data/.is-demo (ถ้ามี)
        ↓
bash scripts/publish.sh [repo-name]
        │
        │  git init → commit → gh repo create → GitHub Pages
        ↓
https://<username>.github.io/<repo-name>/
        │
        │  ส่ง URL ให้หัวหน้าทาง email
        │  ส่งรหัสให้หัวหน้าทาง LINE (ช่องทางแยก!)
        ↓
[หัวหน้าเปิดเว็บ → ใส่รหัส → ถอดรหัสในเบราว์เซอร์ → ดูปฏิทิน]
```

---

## 1. Export JSON จากแอป

กดปุ่ม **"ส่งให้หัวหน้า"** ในแอป Daily Worklog → ได้ไฟล์ `worklog-YYYY-MM.json`
(ตัวอย่าง: `worklog-2026-06.json`) — AirDrop หรือ Files มาบน Mac

---

## 2. เข้ารหัสในเครื่อง

```bash
# cd ไปที่โฟลเดอร์ worklog-boss-web ก่อน
cd ~/Projects/worklog-boss-web

WORKLOG_PASS="<รหัสแข็ง>" node scripts/encrypt.mjs ~/Downloads/worklog-2026-06.json

# ลบ demo marker (ครั้งแรกที่ใช้ข้อมูลจริง)
rm -f data/.is-demo
```

ผลลัพธ์: `data/worklog.enc` (ciphertext — commit ได้ไม่มีปัญหา)

> **อย่าใส่รหัสลงใน script / README / git commit message**

### แนะนำรหัสที่ดี

- ยาว **≥ 4 คำสุ่ม** หรือ **≥ 12 ตัวอักษร** ผสมตัวเลข/สัญลักษณ์
- ตัวอย่างรูปแบบที่จำง่ายและแข็ง: `แมว-ฟ้า-กาแฟ-2026` หรือ `coffee-moon-7392`
- เก็บรหัสใน password manager (Keychain / 1Password / Bitwarden)
- **ห้ามส่งรหัสพร้อม URL ในช่องทางเดียวกัน**

---

## 3. Publish ขึ้น GitHub Pages

```bash
# ครั้งแรก (สร้าง repo ใหม่, public — รองรับ GitHub Free)
bash scripts/publish.sh worklog-report

# ถ้าบัญชีเป็น Pro/Team และต้องการ private
bash scripts/publish.sh worklog-report --private
```

สคริปต์จะ:
1. ตรวจ `gh auth` และ `data/worklog.enc`
2. เตือนถ้า `.enc` ยังเป็น demo data (ต้องพิมพ์ `YES` ยืนยัน)
3. `git init` (ถ้ายังไม่มี) → `git add` → `git commit`
4. `gh repo create` → `push` → เปิด Pages อัตโนมัติ
5. แสดง URL สุดท้าย

---

## 4. ส่งลิงก์ + รหัสให้หัวหน้า

| สิ่งที่ส่ง | ช่องทาง |
|---|---|
| `https://<username>.github.io/<repo>/` | email / Line Official |
| รหัสผ่าน | LINE ส่วนตัว (คนละช่องทาง!) |

หัวหน้าเปิดเว็บ → ใส่รหัส → ข้อมูลถอดรหัสในเบราว์เซอร์ → ดูปฏิทิน
ไม่มีข้อมูลผ่าน server ใดๆ (static site + client-side decrypt)

---

## อัปเดตข้อมูลรายเดือน (เดือนถัดไป)

```bash
# 1. เข้ารหัสไฟล์เดือนใหม่ (รหัสเดิม)
WORKLOG_PASS="<รหัสเดิม>" node scripts/encrypt.mjs worklog-2026-07.json

# 2. commit + push (repo มีอยู่แล้ว Pages เปิดอยู่แล้ว)
git add data/worklog.enc
git commit -m "update worklog 2026-07"
git push
```

GitHub Pages จะ deploy ใหม่อัตโนมัติ (~1 นาที)

---

## Rotate Passphrase (เปลี่ยนรหัส)

```bash
# 1. เข้ารหัสใหม่ด้วยรหัสใหม่
WORKLOG_PASS="<รหัสใหม่>" node scripts/encrypt.mjs worklog-YYYY-MM.json

# 2. commit + push
git add data/worklog.enc
git commit -m "rotate passphrase $(date +%Y-%m-%d)"
git push

# 3. แจ้งหัวหน้าว่ารหัสเปลี่ยนแล้ว ส่งรหัสใหม่คนละช่องทาง
```

> หมายเหตุ: git history เก็บ ciphertext เก่าไว้ถาวร แต่ถอดรหัสไม่ได้ถ้าไม่มีรหัสเดิม

---

## ข้อจำกัดและคำเตือน

- **GitHub Pages = สาธารณะ (public)** — ใครเปิด URL ได้เห็น ciphertext แต่ไม่เห็นข้อมูล เพราะต้องใส่รหัสก่อน
- **อย่า commit ข้อมูลดิบ** — `.gitignore` กัน `worklog-*.json`, `sample/`, `*.plain.json` ไว้แล้ว แต่ตรวจก่อน push ทุกครั้ง
- **git history ถาวร** — ถ้าเผลอ commit plaintext จะลบออกยาก; ระวังก่อน `git add`
- **รูปภาพ** — photo evidence ที่แนบในแอปไม่ export มากับ JSON (ไม่มีรูปใน repo)
- **ข้อมูลแสดงเดือนเดียว** — เว็บแสดง `data/worklog.enc` ล่าสุดไฟล์เดียว ไม่มี history หลายเดือน

---

## ทดสอบในเครื่อง (Development)

```bash
# 1. เข้ารหัส sample data (ข้อมูล demo)
#    ใช้รหัส demo-local-only ด้านล่างผ่าน WORKLOG_ALLOW_WEAK=1 เท่านั้น
#    ⚠️  "demo-local-2026" คือรหัส DEMO สำหรับทดสอบ local เท่านั้น
#        ห้าม publish ไฟล์ที่ล็อกด้วยรหัสนี้ — ต้องเข้ารหัสใหม่ด้วยรหัสจริงก่อน publish
WORKLOG_ALLOW_WEAK=1 WORKLOG_PASS="demo-local-2026" node scripts/encrypt.mjs sample/worklog-2026-06.json

# 2. ตรวจสอบ round-trip
WORKLOG_ALLOW_WEAK=1 WORKLOG_PASS="demo-local-2026" node scripts/decrypt-check.mjs

# 3. เปิดเว็บในเครื่อง
python3 -m http.server 8080
# เปิด http://localhost:8080 → ใส่รหัส demo-local-2026 → ควรเห็นปฏิทิน
```

หรือใช้ npm scripts:

```bash
npm run encrypt -- sample/worklog-2026-06.json   # ต้อง set WORKLOG_PASS ก่อน
npm run check                                      # ต้อง set WORKLOG_PASS ก่อน
npm run publish                                    # รัน publish.sh
```

---

## โมเดลความปลอดภัย

| ชั้น | รายละเอียด |
|---|---|
| **Encryption** | AES-256-GCM + PBKDF2/SHA-256/600,000 iterations |
| **Key derivation** | salt 16 bytes สุ่มใหม่ทุกครั้ง, ไม่ reuse |
| **Passphrase** | อยู่ในหัวคุณเท่านั้น — ไม่เคยอยู่ใน repo หรือ URL |
| **Decrypt location** | เบราว์เซอร์ของหัวหน้า (Web Crypto API) — ไม่ผ่าน server |
| **CDN/3rd party** | ไม่มี — ใช้ Web Crypto ในตัวเบราว์เซอร์ |
| **Source code** | Public repo ได้เพราะโค้ดไม่มี secret; ciphertext อ่านไม่ออกไม่มีรหัส |

---

## โครงสร้างไฟล์

```
index.html                  หน้าเดียว (lock screen → calendar)
app.js                      render ปฏิทิน + modal วัน
styles.css                  modern vibrant theme
crypto.js                   Web Crypto: PBKDF2 + AES-256-GCM
scripts/
  encrypt.mjs               เข้ารหัส JSON → data/worklog.enc
  decrypt-check.mjs         ทดสอบ round-trip (dev only)
  publish.sh                publish pipeline แบบคำสั่งเดียว
data/
  worklog.enc               ข้อมูลเข้ารหัส (commit ได้)
  .is-demo                  marker: ลบออกหลังเข้ารหัสข้อมูลจริง
sample/
  worklog-2026-06.json      ตัวอย่าง plaintext (.gitignore — ไม่ commit)
```

---

## JSON Contract (หลัง decrypt)

```json
{
  "schema": 1,
  "month": "2026-06",
  "owner": "ชื่อพนักงาน",
  "categories": [
    {"id": "dev", "label": "พัฒนา", "color": "#2563EB"}
  ],
  "days": {
    "2026-06-05": [
      {"slot": 9, "categoryId": "dev", "detail": "แก้บั๊ก export"}
    ]
  }
}
```

`slot` = ชั่วโมงเริ่ม (8 = 08:00). 9 ช่อง/วัน: slot 8..16 = 08:00–17:00 (วันทำงาน จ-ศ)
