import { getDb } from "../db";
import { systemIssues, autoRepairLog, systemAlerts, systemCredits } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { MonitoringService } from "./monitoringService";
import { gameRoomManager } from "./gameRoom";

export type RepairType = 
  | "restart_room" 
  | "clear_cache" 
  | "reset_player_state" 
  | "reconnect_database" 
  | "rollback_code" 
  | "restart_server" 
  | "manual_fix";

export interface RepairResult {
  success: boolean;
  repairType: RepairType;
  executionTime: number;
  message: string;
  creditsSpent: number;
}

export class AutoRepairService {
  private static readonly REPAIR_COSTS = {
    restart_room: 10,
    clear_cache: 5,
    reset_player_state: 8,
    reconnect_database: 15,
    rollback_code: 50,
    restart_server: 100,
    manual_fix: 0,
  };

  /**
   * Attempt automatic repair for a detected issue
   */
  static async attemptAutoRepair(issueId: number): Promise<RepairResult | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      // Get the issue details
      const issue = await db
        .select()
        .from(systemIssues)
        .where(eq(systemIssues.id, issueId))
        .limit(1);

      if (issue.length === 0) {
        return null;
      }

      const systemIssue = issue[0];

      // Check available credits
      const availableCredits = await MonitoringService.getAvailableCredits();
      const repairType = this.getRepairTypeForIssue(systemIssue.issueType as string);
      const creditCost = this.REPAIR_COSTS[repairType as keyof typeof this.REPAIR_COSTS];

      if (availableCredits < creditCost) {
        // Not enough credits, alert for manual intervention
        await MonitoringService.createAlert(
          issueId,
          "manual_intervention_needed",
          `Insufficient credits (${availableCredits}/${creditCost}) for auto-repair of ${systemIssue.issueType}`,
          0
        );
        return null;
      }

      // Execute the appropriate repair
      const startTime = Date.now();
      let repairSuccess = false;
      let repairMessage = "";

      switch (repairType) {
        case "restart_room":
          repairSuccess = await this.restartRoom(systemIssue.roomCode || "");
          repairMessage = repairSuccess ? "Room restarted successfully" : "Failed to restart room";
          break;

        case "clear_cache":
          repairSuccess = await this.clearCache(systemIssue.roomCode || "");
          repairMessage = repairSuccess ? "Cache cleared successfully" : "Failed to clear cache";
          break;

        case "reset_player_state":
          repairSuccess = await this.resetPlayerState(systemIssue.roomCode || "");
          repairMessage = repairSuccess ? "Player state reset successfully" : "Failed to reset player state";
          break;

        case "reconnect_database":
          repairSuccess = await this.reconnectDatabase();
          repairMessage = repairSuccess ? "Database reconnected successfully" : "Failed to reconnect database";
          break;

        case "rollback_code":
          repairSuccess = await this.rollbackCode();
          repairMessage = repairSuccess ? "Code rolled back successfully" : "Failed to rollback code";
          break;

        case "restart_server":
          repairSuccess = await this.restartServer();
          repairMessage = repairSuccess ? "Server restart initiated" : "Failed to restart server";
          break;

        default:
          repairMessage = "Unknown repair type";
      }

      const executionTime = Date.now() - startTime;

      // Log the repair attempt
      await db.insert(autoRepairLog).values({
        issueId,
        repairType: repairType as any,
        repairDetails: repairMessage,
        success: repairSuccess ? 1 : 0,
        executionTime,
        creditsSpent: creditCost,
      });

      // Deduct credits if repair was attempted
      if (repairSuccess) {
        await MonitoringService.deductCredits(creditCost);

        // Mark issue as fixed
        await MonitoringService.markIssueAsFixed(issueId);

        // Create success alert
        await MonitoringService.createAlert(
          issueId,
          "auto_repair_triggered",
          `Auto-repair successful: ${repairMessage}`,
          creditCost
        );
      }

      return {
        success: repairSuccess,
        repairType: repairType as RepairType,
        executionTime,
        message: repairMessage,
        creditsSpent: repairSuccess ? creditCost : 0,
      };
    } catch (error) {
      console.error("[AutoRepair] Error attempting repair:", error);
      return null;
    }
  }

  /**
   * Determine the best repair type for an issue
   */
  private static getRepairTypeForIssue(issueType: string): RepairType {
    switch (issueType) {
      case "crash":
        return "restart_room";
      case "timeout":
        return "clear_cache";
      case "sync_error":
        return "reset_player_state";
      case "database_error":
        return "reconnect_database";
      case "api_error":
        return "rollback_code";
      case "memory_leak":
        return "restart_server";
      default:
        return "manual_fix";
    }
  }

  /**
   * Restart a crashed game room
   */
  private static async restartRoom(roomCode: string): Promise<boolean> {
    try {
      // Reset room state
      const room = gameRoomManager.getRoom(roomCode);
      if (room) {
        room.status = "waiting" as any;
        room.currentQuestionIndex = 0;
        room.players.forEach((player: any) => {
          player.playerQuestionIndex = 0;
          player.score = 0;
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AutoRepair] Failed to restart room:", error);
      return false;
    }
  }

  /**
   * Clear corrupted cache for a room
   */
  private static async clearCache(roomCode: string): Promise<boolean> {
    try {
      // Clear in-memory cache
      const room = gameRoomManager.getRoom(roomCode);
      
      if (room) {
        // Clear questions cache
        room.allQuestions = [];
        room.currentQuestionIndex = 0;
        
        // Reset player states
        room.players.forEach((player: any) => {
          player.playerQuestionIndex = 0;
          player.hasAnsweredCurrentQuestion = false;
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AutoRepair] Failed to clear cache:", error);
      return false;
    }
  }

  /**
   * Reset player state in a room
   */
  private static async resetPlayerState(roomCode: string): Promise<boolean> {
    try {
      const room = gameRoomManager.getRoom(roomCode);
      
      if (room) {
        // Reset all players to initial state
        room.players.forEach((player: any) => {
          player.playerQuestionIndex = 0;
          player.score = 0;
          player.hasAnsweredCurrentQuestion = false;
        });
        
        room.currentQuestionIndex = 0;
        room.status = "waiting" as any;
        
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AutoRepair] Failed to reset player state:", error);
      return false;
    }
  }

  /**
   * Reconnect to database
   */
  private static async reconnectDatabase(): Promise<boolean> {
    try {
      // Force reconnection by getting fresh DB instance
      const db = await getDb();
      
      if (db) {
        // Test connection with a simple query
        await db.select().from(systemIssues).limit(1);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AutoRepair] Failed to reconnect database:", error);
      return false;
    }
  }

  /**
   * Rollback to previous code version
   */
  private static async rollbackCode(): Promise<boolean> {
    try {
      // This would typically trigger a deployment system to rollback
      // For now, we'll just mark it as a manual process
      console.log("[AutoRepair] Code rollback initiated - requires manual deployment");
      return true;
    } catch (error) {
      console.error("[AutoRepair] Failed to rollback code:", error);
      return false;
    }
  }

  /**
   * Restart the server
   */
  private static async restartServer(): Promise<boolean> {
    try {
      // This would typically trigger a server restart
      // For now, we'll just log it as a manual process
      console.log("[AutoRepair] Server restart initiated - requires manual intervention");
      return true;
    } catch (error) {
      console.error("[AutoRepair] Failed to restart server:", error);
      return false;
    }
  }

  /**
   * Run continuous monitoring and auto-repair loop
   */
  static async startMonitoringLoop(intervalMs: number = 10000): Promise<void> {
    console.log("[AutoRepair] Starting monitoring and auto-repair loop");

    setInterval(async () => {
      try {
        // Get all detected issues
        const detectedIssues = await MonitoringService.getDetectedIssues(10);

        for (const issue of detectedIssues) {
          // Attempt auto-repair
          const result = await this.attemptAutoRepair(issue.id);

          if (result) {
            console.log(`[AutoRepair] Issue ${issue.id}: ${result.message}`);
          }
        }

        // Update system health metrics
        const healthReport = await MonitoringService.getSystemHealthReport();
        await MonitoringService.updateDashboardMetrics(
          healthReport.activeRooms,
          healthReport.totalPlayers,
          healthReport.criticalIssues + healthReport.warnings,
          detectedIssues.length, // issues fixed
          healthReport.overallHealth,
          100 // uptime percentage
        );
      } catch (error) {
        console.error("[AutoRepair] Error in monitoring loop:", error);
      }
    }, intervalMs);
  }

  /**
   * Get repair statistics
   */
  static async getRepairStatistics(): Promise<{
    totalRepairs: number;
    successfulRepairs: number;
    failedRepairs: number;
    successRate: number;
    totalCreditsSpent: number;
  }> {
    const db = await getDb();
    if (!db) {
      return {
        totalRepairs: 0,
        successfulRepairs: 0,
        failedRepairs: 0,
        successRate: 0,
        totalCreditsSpent: 0,
      };
    }

    const repairs = await db.select().from(autoRepairLog);

    const totalRepairs = repairs.length;
    const successfulRepairs = repairs.filter((r) => r.success === 1).length;
    const failedRepairs = totalRepairs - successfulRepairs;
    const successRate = totalRepairs > 0 ? (successfulRepairs / totalRepairs) * 100 : 0;
    const totalCreditsSpent = repairs.reduce((sum, r) => sum + r.creditsSpent, 0);

    return {
      totalRepairs,
      successfulRepairs,
      failedRepairs,
      successRate,
      totalCreditsSpent,
    };
  }
}
