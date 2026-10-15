import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentSession, STAFF_ROLES } from "@/lib/auth";
import {
  profileDateFields,
  profileEditableFields,
  profileJsonFields,
  profileValuesEqual,
} from "@/lib/profile-changes";

const editableFields = new Set(profileEditableFields);
const dateFields = new Set<string>(profileDateFields);
const jsonFields = new Set<string>(profileJsonFields);
const jobExperienceProperties = new Set([
  "instituteOrganization",
  "designation",
  "from",
  "to",
]);
const educationProperties = new Set([
  "institution",
  "location",
  "boardUniversity",
  "yearOfPassing",
  "group",
  "result",
  "institutionUniversity",
  "privatePublic",
  "subject",
  "degreeAttained",
  "schoolCollege",
  "description",
]);

class ReviewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return value.includes("T")
    ? parsed.toISOString().slice(0, 10) === value.slice(0, 10)
    : parsed.toISOString().slice(0, 10) === value;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function validateProfileValue(key: string, value: unknown) {
  if (dateFields.has(key)) {
    return value === null || (typeof value === "string" && isDateString(value));
  }
  if (!jsonFields.has(key)) return value === null || typeof value === "string";
  if (value === null) return true;
  if (key === "jobExperiences") {
    return (
      Array.isArray(value) &&
      value.length <= 3 &&
      value.every(
        (entry) =>
          isRecord(entry) &&
          Object.entries(entry).every(
            ([property, fieldValue]) =>
              jobExperienceProperties.has(property) &&
              (fieldValue === null ||
                typeof fieldValue === "string" &&
                  (property !== "from" &&
                    property !== "to" ||
                    fieldValue === "" ||
                    isDateString(fieldValue))),
          ),
      )
    );
  }
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([property, fieldValue]) =>
        educationProperties.has(property) && isPrimitive(fieldValue),
    )
  );
}

function validBaseline(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key]) => editableFields.has(key),
    )
  );
}

function reviewPayload(value: unknown) {
  if (!isRecord(value)) {
    throw new ReviewError("The submitted profile changes are invalid.", 400);
  }

  const fields: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === "_baseline" || key === "sheetObservations") continue;
    if (!editableFields.has(key)) continue;
    if (jsonFields.has(key) && fieldValue === "") {
      fields[key] = null;
      continue;
    }
    if (!validateProfileValue(key, fieldValue)) {
      throw new ReviewError(`The submitted value for ${key} is invalid.`, 400);
    }
    fields[key] = fieldValue;
  }

  const baselineValue = value._baseline;
  if (baselineValue !== undefined && !validBaseline(baselineValue)) {
    throw new ReviewError("The saved request baseline is invalid.", 400);
  }

  return {
    fields,
    baseline: baselineValue as Record<string, unknown> | undefined,
  };
}

function toUpdateData(
  fields: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (profileValuesEqual(current[key], value, key)) continue;
    if (dateFields.has(key)) {
      update[key] = value === null ? null : new Date(value as string);
    } else if (jsonFields.has(key)) {
      update[key] = value === null ? Prisma.DbNull : value;
    } else {
      update[key] = value;
    }
  }
  return update;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await currentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const user = session.user as { id?: string; role?: string };
  if (!STAFF_ROLES.includes(user.role ?? "") || !user.id) {
    return NextResponse.json(
      { error: "Only authorized staff can review profile requests." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = body.action;
  const note = body.note === undefined ? "" : body.note;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (typeof note !== "string" || note.length > 2000) {
    return NextResponse.json(
      { error: "Reviewer note must be 2,000 characters or fewer." },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const changeRequest = await tx.changeRequest.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!changeRequest || changeRequest.status !== "PENDING") {
        throw new ReviewError("Request is no longer pending.", 409);
      }
      if (changeRequest.submittedById === user.id) {
        throw new ReviewError("You cannot review your own profile request.", 403);
      }

      const parsed = action === "approve" ? reviewPayload(changeRequest.payload) : null;
      const current = Object.fromEntries(
        profileEditableFields.map((key) => [
          key,
          changeRequest.employee[key as keyof typeof changeRequest.employee],
        ]),
      );
      const updateData =
        parsed && action === "approve"
          ? toUpdateData(parsed.fields, current)
          : {};

      if (action === "approve" && !Object.keys(updateData).length) {
        throw new ReviewError(
          "There are no effective profile changes to apply.",
          409,
        );
      }

      if (action === "approve" && parsed) {
        if (parsed.baseline) {
          for (const [key, proposed] of Object.entries(parsed.fields)) {
            const baseline = parsed.baseline[key];
            if (
              baseline !== undefined &&
              !profileValuesEqual(baseline, proposed, key) &&
              !profileValuesEqual(current[key], baseline, key) &&
              !profileValuesEqual(current[key], proposed, key)
            ) {
              throw new ReviewError(
                `The employee profile changed after this request was submitted (${key}). Refresh the request and review the latest profile.`,
                409,
              );
            }
          }
        } else if (changeRequest.employee.updatedAt > changeRequest.createdAt) {
          throw new ReviewError(
            "The employee profile has changed since this older request was submitted. It cannot be applied safely; reject it and ask the employee to submit a new request.",
            409,
          );
        }
      }

      const markedReviewed = await tx.changeRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: action === "approve" ? "APPROVED" : "REJECTED",
          reviewedById: user.id,
          reviewerNote: note.trim(),
          reviewedAt: new Date(),
        },
      });
      if (markedReviewed.count !== 1) {
        throw new ReviewError("Request is no longer pending.", 409);
      }

      if (action === "approve") {
        const applied = await tx.employee.updateMany({
          where: {
            id: changeRequest.employeeId,
            updatedAt: changeRequest.employee.updatedAt,
          },
          data: updateData as Prisma.EmployeeUpdateManyMutationInput,
        });
        if (applied.count !== 1) {
          throw new ReviewError(
            "The employee profile changed during this review. Refresh the request and compare the latest profile before approving.",
            409,
          );
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action:
            action === "approve"
              ? "APPROVE_CHANGE_REQUEST"
              : "REJECT_CHANGE_REQUEST",
          entityType: "ChangeRequest",
          entityId: id,
          metadata: { note: note.trim() },
        },
      });
      return action;
    });

    return NextResponse.json({
      message:
        result === "approve"
          ? "Changes approved and applied."
          : "Request rejected.",
    });
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
