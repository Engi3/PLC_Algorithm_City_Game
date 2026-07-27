# รายละเอียดโครงการ: PLC Algorithm City Game

## 1. ภาพรวมโครงการ (Project Overview)
**ชื่อโปรเจกต์:** PLC Algorithm City Game
**กลุ่มเป้าหมาย:** นักเรียน นักศึกษาสาขาวิชาเมคคาทรอนิกส์และหุ่นยนต์ 
**วัตถุประสงค์:** เว็บแอปพลิเคชันเพื่อการศึกษาที่เปลี่ยนการเรียนรู้อัลกอริทึมและตรรกะของ Programmable Logic Controller (PLC) ให้เป็นเกม โดยมี AI (Gemini) เป็นผู้ช่วยสอน และมีระบบ Dashboard สำหรับครูผู้สอนเพื่อวิเคราะห์พฤติกรรมการเรียนรู้รายบุคคล

## 2. เครื่องมือและเทคโนโลยี (Tech Stack)
*   **Frontend:** Next.js (React), Tailwind CSS (เน้น Responsive UI ไม่เพี้ยนบนมือถือ แท็บเล็ต และ PC)
*   **Game Engine/UI:** React Drag-and-Drop (เช่น `@dnd-kit/core`) ร่วมกับ CSS Grid สำหรับสร้างหน้าต่างเขียนโปรแกรมแบบ Ladder Logic
*   **Backend & Database:** Supabase (PostgreSQL, ระบบ Authentication, Storage, Row Level Security)
*   **AI Integration:** Google Gemini API (ผ่าน Google AI Studio)
*   **Data Visualization:** Chart.js หรือ Recharts (สำหรับ Radar Chart และ Dashboard)
*   **Export Tools:** `react-csv` หรือ `xlsx` (สำหรับ Export เป็น CSV/Excel)
*   **Hosting:** Vercel

## 3. ฟีเจอร์หลัก (Core Features)

### 3.1. ระบบสมาชิกและสิทธิ์การใช้งาน (Auth & Roles)
*   **บัญชีทดลองเล่น (Guest):** 
    *   มี User ID เตรียมไว้ในระบบคือ `guest00` ถึง `guest99` (Password: `guest00` ถึง `guest99`)
    *   ใช้สำหรับทดลองเล่นเกมเท่านั้น ไม่สามารถแก้ไขข้อมูลส่วนตัวได้
*   **นักเรียน (Student):** 
    *   สมัครสมาชิกโดยต้องกรอกข้อมูลส่วนตัวที่จำเป็นให้ครบถ้วน เช่น ชื่อ, นามสกุล, รหัสนักเรียน/นักศึกษา
    *   สามารถเปลี่ยนแปลง ID และ Password ได้ในอนาคต
    *   เล่นเกม, จัดการไอเทม, ดูคะแนนและ Radar Chart ของตัวเอง, รับคำแนะนำจาก AI แบบเฉพาะตัว
*   **ครู (Teacher/Admin):** 
    *   มีบัญชีเริ่มต้นคือ ID: `Admin101`, Password: `root101` (สามารถเปลี่ยน ID และ Password ได้ในอนาคต)
    *   ดู Dashboard ภาพรวมและรายบุคคล, ดูพฤติกรรมการเรียนรู้, กรอกคะแนนภาคปฏิบัติ, Export ข้อมูล (Excel/CSV), จัดการเนื้อหาด่านต่างๆ

### 3.2. ระบบเกม (Algorithm City Game)
*   **ด่านการเรียนรู้ (Levels):** ประมาณ 100 ด่าน เรียงลำดับจากง่ายไปยาก (รองรับการปรับสเกลสำหรับวิชาอื่นในอนาคต)
*   **รูปแบบเกม (Ladder Logic Interface):** ผู้เรียนลากวาง **บล็อกคำสั่งแบบ Ladder PLC** (เช่น NO, NC, Coil, Timer, Counter) ลงบน Rung เพื่อสร้าง Logic สั่งให้ตัวละคร/หุ่นยนต์ ทำภารกิจสำเร็จ ถือเป็นการฝึกใช้อุปกรณ์และหน้าต่างเขียนโปรแกรม PLC ของจริงไปในตัว
*   **ระบบพลังงานและไอเทม:** การทำภารกิจต้องใช้ "พลังงาน" หากผ่านด่านจะได้คะแนนและเหรียญ เพื่อนำไปซื้อไอเทมช่วยเหลือ
*   **Language View Toggle:** ปุ่มสลับมุมมองโค้ดระหว่าง **Ladder Diagram (LD)**, **Function Block Diagram (FBD)**, และ **Structured Text (ST)** เพื่อให้ผู้เรียนเห็นความเชื่อมโยงของภาษา PLC ทั้ง 3 รูปแบบเมื่อเทียบกับลอจิกที่ตนเองสร้าง
*   **Replay & Debugging:** หากรันคำสั่งแล้วล้มเหลว ระบบจะแสดงลำดับการทำงานทีละขั้น (Step-by-step) เพื่อให้เห็นจุดที่เกิด Error

### 3.3. ระบบ AI ช่วยเหลือและวิเคราะห์ (Gemini API Tutor)
*   **วิเคราะห์กระบวนการคิด:** นำ Log ชุดคำสั่ง Ladder ที่นักเรียนต่อพลาด ส่งให้ AI ประเมินหาช่องโหว่ของลอจิก
*   **ให้คำแนะนำแบบ Hint:** AI จะทำหน้าที่เป็น Tutor แนะนำแนวทางแก้ไขแบบไม่เฉลยตรงๆ เพื่อกระตุ้นให้เกิดการคิดวิเคราะห์
*   **ประมวลผลพฤติกรรมให้ครู:** AI สรุปข้อมูลการเรียนรู้ของเด็กแต่ละคน แนะนำแนวทางการดูแลผู้เรียนให้ครูทราบผ่าน Dashboard

### 3.4. ระบบให้คะแนนและ Dashboard ประเมินผล
*   **คะแนนจากเกมอัตโนมัติ (Game Score):** คำนวณจากความถูกต้องและจำนวนบล็อก Ladder ที่ใช้ (ยิ่งเขียนโค้ดได้กระชับยิ่งได้คะแนนเยอะ)
*   **คะแนนภาคปฏิบัติ (Practical Score):** ครูผู้สอนประเมินและกรอกข้อมูลเข้าระบบหลังจากการทำปฏิบัติการจริง (On-site)
*   **Radar Chart วิเคราะห์ผู้เรียน:** กราฟใยแมงมุมที่แสดงสมรรถนะหลายมิติ มีทั้งมุมมองภาพรวมทั้งห้อง และระดับบุคคล
*   **Data Export:** รองรับการดึงข้อมูลออกมาในรูปแบบ Excel หรือ CSV เท่านั้น

## 4. โครงสร้างฐานข้อมูลเบื้องต้น (Supabase Schema Guide)
*   `users`: เก็บข้อมูลผู้ใช้งาน (id, role, student_id, first_name, last_name, is_guest, coins, energy, created_at)
*   `levels`: เก็บข้อมูลด่าน (id, level_number, map_layout_json, optimal_blocks_count)
*   `play_logs`: บันทึกพฤติกรรมการเล่น (id, user_id, level_id, ladder_blocks_json, is_success, attempts)
*   `student_scores`: เก็บข้อมูลคะแนน (user_id, game_logic_score, onsite_practical_score, updated_at)


# Other data

Supabase project ref, database password, Supabase API keys, and the Gemini
API key are kept in `.env.local` (gitignored) - not in this file. See
`.env.local.example` for the variable names.

#GitHub: gh repo clone Engi3/PLC_Algorithm_City_Game