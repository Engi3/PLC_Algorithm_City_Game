export type IoRow = {
  address: string;
  name: string;
  type: "อินพุตดิจิทัล" | "เอาต์พุตดิจิทัล" | "อินพุตอนาล็อก";
  description: string;
};

/** Standardized Maze I/O map (see maze-plc-binding.ts's header comment) - shown as a reference table on the level detail page and inside the play screen's guide, so a student never has to guess what X0-X2/Y0-Y2/AI0 mean. */
export const MAZE_IO_ROWS: IoRow[] = [
  { address: "X0", name: "มีกำแพงข้างหน้า", type: "อินพุตดิจิทัล", description: "เซนเซอร์ตรวจกำแพงด้านหน้าหุ่นยนต์ - เป็นจริงเมื่อมีกำแพงกั้น" },
  { address: "X1", name: "มีกำแพงด้านซ้าย", type: "อินพุตดิจิทัล", description: "เซนเซอร์ตรวจกำแพงด้านซ้ายของหุ่นยนต์" },
  { address: "X2", name: "มีกำแพงด้านขวา", type: "อินพุตดิจิทัล", description: "เซนเซอร์ตรวจกำแพงด้านขวาของหุ่นยนต์" },
  { address: "AI0", name: "ระยะทางถึงเป้าหมาย", type: "อินพุตอนาล็อก", description: "ระยะทางแบบแมนฮัตตัน (Manhattan Distance) จากตำแหน่งปัจจุบันถึงธงเป้าหมาย" },
  { address: "Y0", name: "เดินหน้า", type: "เอาต์พุตดิจิทัล", description: "สั่งให้หุ่นยนต์เดินหน้าหนึ่งช่อง (ถ้ามีกำแพงกั้นอยู่จะไม่ขยับ)" },
  { address: "Y1", name: "เลี้ยวซ้าย", type: "เอาต์พุตดิจิทัล", description: "หมุนตัวหุ่นยนต์ 90° ไปทางซ้าย (ไม่เปลี่ยนตำแหน่ง)" },
  { address: "Y2", name: "เลี้ยวขวา", type: "เอาต์พุตดิจิทัล", description: "หมุนตัวหุ่นยนต์ 90° ไปทางขวา (ไม่เปลี่ยนตำแหน่ง)" },
];

/** Standardized Factory I/O map (see factory-plc-binding.ts's header comment) - Y1/Y2/Y3/Y4/Y5-Y7 only matter on levels that actually enable that mechanic (sorting robot / heater / robot arm / reverse belt / traffic light), same as the old plain-text notes this table replaces. */
export const FACTORY_IO_ROWS: IoRow[] = [
  { address: "X0", name: "เซนเซอร์ตรวจจับชิ้นงาน", type: "อินพุตดิจิทัล", description: "เป็นจริงเมื่อมีชิ้นงานอยู่ในตำแหน่งเซนเซอร์บนสายพาน" },
  { address: "X1", name: "เซนเซอร์ตรวจของเสีย", type: "อินพุตดิจิทัล", description: "เป็นจริงเมื่อชิ้นงานที่ตำแหน่งเซนเซอร์เป็นของเสีย" },
  { address: "AI1", name: "ระดับน้ำในถัง", type: "อินพุตอนาล็อก", description: "ค่าระดับน้ำปัจจุบันในถัง (เพิ่มขึ้นเรื่อยๆ ตามเวลา)" },
  { address: "AI2", name: "อุณหภูมิ", type: "อินพุตอนาล็อก", description: "ค่าอุณหภูมิปัจจุบัน (เพิ่มขึ้นเมื่อฮีตเตอร์ทำงาน ลดลงเมื่อปิด)" },
  { address: "AI3", name: "หมวดหมู่ชิ้นงาน", type: "อินพุตอนาล็อก", description: "หมวดหมู่ของชิ้นงานที่ตำแหน่งเซนเซอร์ (เฉพาะด่านคัดแยก)" },
  { address: "Y0", name: "สายพานลำเลียง", type: "เอาต์พุตดิจิทัล", description: "เปิด/ปิดมอเตอร์สายพาน" },
  { address: "Y1", name: "ตัวดัน/แขนหุ่นยนต์ (ถังที่ 2)", type: "เอาต์พุตดิจิทัล", description: "ดันชิ้นงานออกจากสายพานที่สถานีที่ 2 (เฉพาะด่านที่มีกลไกนี้)" },
  { address: "Y2", name: "ฮีตเตอร์", type: "เอาต์พุตดิจิทัล", description: "เปิด/ปิดฮีตเตอร์ต้มน้ำในถัง (เฉพาะด่านที่มีกลไกนี้)" },
  { address: "Y3", name: "แขนหุ่นยนต์ (ถังที่ 1)", type: "เอาต์พุตดิจิทัล", description: "ดันชิ้นงานออกจากสายพานที่สถานีที่ 1 (เฉพาะด่านคัดแยก)" },
  { address: "Y4", name: "สายพานย้อนกลับ", type: "เอาต์พุตดิจิทัล", description: "สั่งให้สายพานวิ่งย้อนกลับ ส่งของเสียกลับไปจุดเริ่มต้น (เฉพาะด่านที่มีกลไกนี้)" },
  { address: "Y5", name: "ไฟแดง", type: "เอาต์พุตดิจิทัล", description: "ไฟสัญญาณจราจรสีแดง (เฉพาะด่านไฟจราจร)" },
  { address: "Y6", name: "ไฟเหลือง", type: "เอาต์พุตดิจิทัล", description: "ไฟสัญญาณจราจรสีเหลือง (เฉพาะด่านไฟจราจร)" },
  { address: "Y7", name: "ไฟเขียว", type: "เอาต์พุตดิจิทัล", description: "ไฟสัญญาณจราจรสีเขียว - ประตูเปิดให้สินค้าผ่านเมื่อไฟเขียวติด (เฉพาะด่านไฟจราจร)" },
];

/**
 * Hybrid-only Maze/AGV I/O map. Deliberately DIFFERENT addresses from
 * MAZE_IO_ROWS (X10-X12/Y10-Y12/AI10 instead of X0-X2/Y0-Y2/AI0) so a Hybrid
 * level's combined I/O table never shows the same address meaning two
 * different things next to FACTORY_IO_ROWS (X0-X1/Y0-Y7/AI1-AI3) - the AGV
 * half and the Factory half of a Hybrid program can be written and read as
 * two fully independent circuits, no phase-detection required. See
 * hybridMazeBinding in maze-plc-binding.ts for the matching engine mapping.
 */
export const HYBRID_MAZE_IO_ROWS: IoRow[] = [
  { address: "X10", name: "มีกำแพงข้างหน้า", type: "อินพุตดิจิทัล", description: "เซนเซอร์ตรวจกำแพงด้านหน้าหุ่นยนต์ - เป็นจริงเมื่อมีกำแพงกั้น" },
  { address: "X11", name: "มีกำแพงด้านซ้าย", type: "อินพุตดิจิทัล", description: "เซนเซอร์ตรวจกำแพงด้านซ้ายของหุ่นยนต์" },
  { address: "X12", name: "มีกำแพงด้านขวา", type: "อินพุตดิจิทัล", description: "เซนเซอร์ตรวจกำแพงด้านขวาของหุ่นยนต์" },
  { address: "AI10", name: "ระยะทางถึงเป้าหมาย", type: "อินพุตอนาล็อก", description: "ระยะทางแบบแมนฮัตตัน (Manhattan Distance) จากตำแหน่งปัจจุบันถึงธงเป้าหมาย" },
  { address: "Y10", name: "เดินหน้า", type: "เอาต์พุตดิจิทัล", description: "สั่งให้หุ่นยนต์เดินหน้าหนึ่งช่อง (ถ้ามีกำแพงกั้นอยู่จะไม่ขยับ)" },
  { address: "Y11", name: "เลี้ยวซ้าย", type: "เอาต์พุตดิจิทัล", description: "หมุนตัวหุ่นยนต์ 90° ไปทางซ้าย (ไม่เปลี่ยนตำแหน่ง)" },
  { address: "Y12", name: "เลี้ยวขวา", type: "เอาต์พุตดิจิทัล", description: "หมุนตัวหุ่นยนต์ 90° ไปทางขวา (ไม่เปลี่ยนตำแหน่ง)" },
];
