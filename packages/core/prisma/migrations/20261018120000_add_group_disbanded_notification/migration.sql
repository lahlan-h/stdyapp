/*
  Tells a study group's members that it is gone because its owner deleted
  their account - see deleteAccount in apps/api/src/services/account.service.js.

  A NEW value rather than SYSTEM, so the app can give it a group's icon. A build
  that predates it still shows the row, as SYSTEM - see notificationMapping.ts.
*/

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_DISBANDED';
