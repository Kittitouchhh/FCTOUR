# ⚽ FC Online Cup — บอลเดินสาย

เว็บจัดสายแข่ง FC Online มี 3 โหมด ทุกคนที่เปิดลิงก์เห็นสายแข่งและผลเดียวกันแบบสด (อัปเดตเองทุก 3 วินาที)

1. **สายบน-สายล่าง** (Double Elimination) แพ้ครั้งแรกตกไปสายล่าง แพ้ 2 ครั้งตกรอบ เปิด/ปิดนัดรีเซ็ตชิงแชมป์ได้
2. **แพ้ตกรอบ** (Single Elimination) ไม่มีสายล่าง
3. **เก็บคะแนน** (Round Robin) ชนะ 3 เสมอ 1 แพ้ 0 · เรียงตาม แต้ม → ผลต่างประตู → ประตูได้ · เลือกเจอกัน 1 หรือ 2 นัดได้

รองรับ 2–64 ทีม จำนวนไหนก็ได้ (ถ้าไม่ลง 4/8/16/32 จะได้ BYE ให้มือวางอัตโนมัติ) · สุ่มจับสายได้ · แก้ชื่อทีมทีหลังได้โดยผลไม่หาย · เสมอในรอบน็อกเอาต์เลือกคนชนะจุดโทษ

## โครงสร้าง

```
index.html   หน้าเว็บทั้งหมด (HTML/CSS/JS ล้วน ไม่ต้อง build)
bracket.js   logic จัดสาย / คำนวณผล / ตารางคะแนน
api/t.js     Vercel Function เก็บข้อมูลใน Upstash Redis
```

ไม่มี dependency ไม่ต้อง `npm install`

## Deploy ขึ้น Vercel

1. push repo นี้ขึ้น GitHub
2. เข้า vercel.com → **Add New → Project** → เลือก repo → Framework Preset: **Other** → Deploy
3. ในโปรเจกต์บน Vercel ไปที่ **Storage → Create Database → Upstash (Redis)** → เชื่อมกับโปรเจกต์นี้ (Vercel จะใส่ env `KV_REST_API_URL` / `KV_REST_API_TOKEN` ให้เอง)
4. **Deployments → Redeploy** หนึ่งรอบให้ env มีผล
5. เปิดเว็บ มุมขวาบนต้องขึ้น 🟢 "ออนไลน์ · ทุกคนเห็นเหมือนกัน"

ถ้ายังไม่ได้ต่อฐานข้อมูล เว็บยังใช้ได้แต่จะขึ้น 🟡 โหมดออฟไลน์ (เก็บแค่ในเบราว์เซอร์เครื่องนั้น)

### กันเพื่อนมาแก้ผลมั่ว (ไม่บังคับ)

ใส่ env `EDIT_PIN` เช่น `1234` ใน Vercel → Settings → Environment Variables แล้ว Redeploy
ทุกคนยังดูได้ แต่จะสร้าง/ใส่ผล/ลบต้องใส่ PIN (เว็บจะถามครั้งแรกแล้วจำไว้ในเครื่อง)

## รันในเครื่อง

```bash
npm i -g vercel
vercel link        # ผูกกับโปรเจกต์บน Vercel
vercel env pull    # ดึง env ของ Redis มา
vercel dev
```

หรือเปิด `index.html` ตรงๆ ก็ได้ (จะเป็นโหมดออฟไลน์)
