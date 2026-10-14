import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const observationWriters = ["DEVELOPER", "AUTHORITY"];

export async function GET(request: Request) {
  const session = await currentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const user = session.user as { id?: string; role?: string };
  if (user.role === "COMPUTER_OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employeeId = new URL(request.url).searchParams.get("employeeId");
  if (!employeeId) {
    return NextResponse.json({ error: "Employee ID is required." }, { status: 400 });
  }

  if (!observationWriters.includes(user.role ?? "")) {
    if (!user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!employee || employee.id !== employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const observations = await prisma.observation.findMany({
    where: { employeeId },
    orderBy: [{ observationDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      subject: true,
      description: true,
      observationDate: true,
    },
  });

  return NextResponse.json({ observations });
}

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const user = session.user as { id?: string; role?: string };
  if (!observationWriters.includes(user.role ?? "")) {
    return NextResponse.json(
      { error: "Only Authority or Developer can add observations." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { employeeId, subject, description, date } = body as Record<string, unknown>;
  if (
    typeof employeeId !== "string" ||
    !employeeId ||
    typeof subject !== "string" ||
    !subject.trim() ||
    subject.trim().length > 160 ||
    typeof description !== "string" ||
    !description.trim() ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  ) {
    return NextResponse.json(
      { error: "A valid date, subject (up to 160 characters), and description are required." },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (!user.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const userId = user.id;

  const observation = await prisma.$transaction(async (tx) => {
    const created = await tx.observation.create({
      data: {
        employeeId,
        subject: subject.trim(),
        description: description.trim(),
        observationDate: new Date(`${date}T00:00:00.000Z`),
        createdById: userId,
      },
      select: {
        id: true,
        subject: true,
        description: true,
        observationDate: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "ADD_OBSERVATION",
        entityType: "Observation",
        entityId: created.id,
      },
    });
    return created;
  });

  return NextResponse.json({ message: "Observation saved.", observation });
}
