-- Student self-registration (Prompt 01): the language a student chose when registering.
-- New self-registered students start with status 'PENDING' (User.status is text, so no type change is needed)
-- and can't sign in or open learning content until a teacher or admin approves them.
ALTER TABLE "User" ADD COLUMN "preferred_language" TEXT;
