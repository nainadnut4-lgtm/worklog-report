#!/usr/bin/env bash
# publish.sh — อัปโหลด worklog-boss-web ขึ้น GitHub Pages แบบคำสั่งเดียว
#
# Usage:
#   bash scripts/publish.sh [repo-name] [--private]
#
#   repo-name  ชื่อ GitHub repo ที่จะสร้าง (default: worklog-report)
#   --private  สร้าง private repo (ต้องการ GitHub Pro/Team)
#              ถ้าไม่ใส่ = public (Free account รองรับ Pages บน public เท่านั้น)
#
# ขั้นตอนที่สคริปต์นี้ทำ:
#   1. ตรวจ prerequisite (gh, git, data/worklog.enc)
#   2. เตือนถ้า worklog.enc ยังเป็น demo data
#   3. git init (ถ้ายังไม่มี .git/)
#   4. ตรวจ .gitignore ป้องกันข้อมูลดิบ
#   5. git add (เฉพาะไฟล์โค้ด + ciphertext, ไม่รวม plaintext)
#   6. แสดง git status + เตือนถ้าเจอไฟล์น่าสงสัย
#   7. git commit
#   8. gh repo create (--public หรือ --private)
#   9. เปิด GitHub Pages ผ่าน gh api
#  10. แสดง URL สุดท้าย + ขั้นถัดไป

set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
YLW='\033[1;33m'
GRN='\033[0;32m'
NC='\033[0m'

info()  { echo -e "${GRN}[publish]${NC} $*"; }
warn()  { echo -e "${YLW}[WARN]${NC}    $*"; }
abort() { echo -e "${RED}[ERROR]${NC}   $*" >&2; exit 1; }

# ── args ─────────────────────────────────────────────────────────────────────

REPO_NAME="worklog-report"
VISIBILITY="--public"

for arg in "$@"; do
  case "$arg" in
    --private) VISIBILITY="--private" ;;
    --*)       abort "ไม่รู้จัก flag: $arg (รองรับแค่ --private)" ;;
    *)         REPO_NAME="$arg" ;;
  esac
done

# ── prerequisite checks ───────────────────────────────────────────────────────

info "ตรวจสอบ prerequisite..."

# อยู่ใน worklog-boss-web ?
if [[ ! -f "index.html" || ! -f "scripts/encrypt.mjs" ]]; then
  abort "รัน script นี้จาก root ของ worklog-boss-web เท่านั้น (ไม่เจอ index.html หรือ scripts/encrypt.mjs)"
fi

# gh CLI พร้อมและ authed ?
if ! command -v gh &>/dev/null; then
  abort "ไม่เจอ gh CLI — ติดตั้งก่อน: https://cli.github.com/"
fi
gh auth status &>/dev/null || abort "gh ยังไม่ได้ login — รัน: gh auth login"

# data/worklog.enc มีอยู่ ?
if [[ ! -f "data/worklog.enc" ]]; then
  abort "ไม่เจอ data/worklog.enc — รัน encrypt ก่อน:\n  WORKLOG_PASS=\"<รหัส>\" node scripts/encrypt.mjs <worklog.json>"
fi

# ── demo data guard ───────────────────────────────────────────────────────────
# ถ้ามีไฟล์ data/.is-demo = ยังไม่ได้เข้ารหัสข้อมูลจริง
# ลบไฟล์นี้หลังจาก encrypt ด้วยข้อมูลจริงแล้ว:
#   rm data/.is-demo

if [[ -f "data/.is-demo" ]]; then
  echo ""
  warn "========================================================="
  warn " data/worklog.enc ดูเหมือนเป็น DEMO DATA (พบ data/.is-demo)"
  warn " ถ้าจะ publish pipeline ทดสอบก็ได้ แต่หัวหน้าจะเห็นข้อมูลตัวอย่าง"
  warn "========================================================="
  echo ""
  read -rp "พิมพ์ YES เพื่อยืนยันว่าต้องการ publish demo data: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo ""
    info "ยกเลิก — เข้ารหัสข้อมูลจริงก่อน แล้ว rm data/.is-demo จากนั้นรันอีกครั้ง"
    exit 0
  fi
  warn "ดำเนินการต่อด้วย demo data..."
fi

# ── git init ──────────────────────────────────────────────────────────────────

if [[ ! -d ".git" ]]; then
  info "git init..."
  git init -b main
else
  info ".git/ มีอยู่แล้ว — ข้าม git init"
fi

# ── .gitignore sanity check ───────────────────────────────────────────────────

info "ตรวจ .gitignore..."

MISSING_GUARDS=()
grep -q 'worklog-\*\.json\|worklog-\*.json' .gitignore 2>/dev/null || MISSING_GUARDS+=("worklog-*.json")
grep -q 'sample/'                             .gitignore 2>/dev/null || MISSING_GUARDS+=("sample/")
grep -q '\*\.plain\.json\|\*.plain.json'      .gitignore 2>/dev/null || MISSING_GUARDS+=("*.plain.json")

if [[ ${#MISSING_GUARDS[@]} -gt 0 ]]; then
  abort ".gitignore ขาด guard สำหรับ: ${MISSING_GUARDS[*]}\nแก้ .gitignore ก่อน แล้วรันอีกครั้ง"
fi

info ".gitignore ครบ"

# ── stage files ───────────────────────────────────────────────────────────────

info "เพิ่มไฟล์ที่จะ commit..."
git add \
  index.html \
  app.js \
  crypto.js \
  styles.css \
  data/worklog.enc \
  data/.gitkeep \
  scripts/encrypt.mjs \
  scripts/decrypt-check.mjs \
  scripts/publish.sh \
  README.md

# เพิ่ม package.json ถ้ามี
[[ -f "package.json" ]] && git add package.json
# เพิ่ม .gitignore
[[ -f ".gitignore" ]] && git add .gitignore

# ── status check + suspicious-file warning ───────────────────────────────────

echo ""
info "ไฟล์ที่จะ commit (git status):"
git status --short

# เตือนถ้าเจอ .json ที่ไม่ใช่ .enc (อาจเป็น plaintext หลุดมา)
SUSPECT=$(git status --short | grep -E '\.json$' | grep -v 'worklog\.enc' | grep -v 'package\.json' || true)
if [[ -n "$SUSPECT" ]]; then
  echo ""
  warn "========================================================="
  warn " พบไฟล์ .json ที่ไม่น่า commit:"
  warn "$SUSPECT"
  warn " ตรวจสอบว่าไม่ใช่ plaintext worklog ก่อนดำเนินการต่อ"
  warn "========================================================="
  echo ""
  read -rp "พิมพ์ YES เพื่อยืนยันว่าไม่มีข้อมูลดิบปนมา: " confirm2
  if [[ "$confirm2" != "YES" ]]; then
    info "ยกเลิก — ตรวจสอบไฟล์ที่ marked ข้างบนแล้วรันอีกครั้ง"
    exit 0
  fi
fi

echo ""

# ── commit ────────────────────────────────────────────────────────────────────

# ตรวจว่ามีอะไรจะ commit ไหม (idempotent — ถ้า clean ก็ข้ามได้)
if git diff --cached --quiet; then
  info "ไม่มีการเปลี่ยนแปลงใหม่ — ข้าม commit"
else
  COMMIT_DATE=$(date '+%Y-%m-%d')
  info "Committing..."
  git commit -m "publish worklog-boss-web ${COMMIT_DATE}"
fi

# ── create github repo + push ─────────────────────────────────────────────────

# ตรวจว่ามี remote origin แล้วหรือเปล่า (idempotent re-run)
if git remote get-url origin &>/dev/null; then
  warn "remote origin มีอยู่แล้ว ($(git remote get-url origin)) — ข้าม gh repo create"
  info "push ไปยัง remote ที่มีอยู่..."
  git push -u origin main
else
  info "สร้าง GitHub repo: ${REPO_NAME} (${VISIBILITY/--/})..."
  gh repo create "${REPO_NAME}" ${VISIBILITY} --source=. --push
fi

# ── enable github pages ───────────────────────────────────────────────────────

# ดึง owner จาก gh auth
GH_USER=$(gh api user --jq '.login')

info "เปิด GitHub Pages (branch: main, path: /)..."
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  "/repos/${GH_USER}/${REPO_NAME}/pages" \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/" \
  2>/dev/null || {
    # อาจ fail ถ้า Pages เปิดไปแล้ว (idempotent)
    warn "gh api pages อาจ error เพราะ Pages ถูกเปิดไปแล้ว — ไม่เป็นไร"
  }

# ── done ─────────────────────────────────────────────────────────────────────

PAGES_URL="https://${GH_USER}.github.io/${REPO_NAME}/"

echo ""
info "============================================================"
info " เสร็จแล้ว!"
info " URL: ${PAGES_URL}"
info "============================================================"
echo ""
info "ขั้นถัดไป:"
echo "  1. รอ ~1-2 นาที GitHub Pages build เสร็จ"
echo "  2. เปิด ${PAGES_URL} ในเบราว์เซอร์ ทดสอบใส่รหัส"
echo "  3. ส่ง URL ให้หัวหน้าทาง email/LINE"
echo "  4. ส่งรหัสผ่านให้หัวหน้าทาง 'ช่องทางแยกต่างหาก' (ไม่ส่งพร้อม URL)"
echo "  5. สำหรับรายเดือนถัดไป:"
echo "       WORKLOG_PASS=\"<รหัส>\" node scripts/encrypt.mjs worklog-YYYY-MM.json"
echo "       git add data/worklog.enc && git commit -m 'update YYYY-MM' && git push"
