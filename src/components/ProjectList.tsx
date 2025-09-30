import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Calendar, FileText, ChevronRight, Settings, MoreVertical, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Project } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/date-utils";
import { Pagination } from "@/components/ui/pagination";

interface ProjectListProps {
  /**
   * Array of projects to display
   */
  projects: Project[];
  /**
   * Callback when a project is clicked
   */
  onProjectClick: (project: Project) => void;
  /**
   * Callback when hooks configuration is clicked
   */
  onProjectSettings?: (project: Project) => void;
  /**
   * Whether the list is currently loading
   */
  loading?: boolean;
  /**
   * Optional className for styling
   */
  className?: string;
}

const ITEMS_PER_PAGE = 12;
const HIDDEN_PROJECTS_KEY = 'hidden-projects';

/**
 * Extracts the project name from the full path
 *
 * @param path - Full file system path to the project
 * @returns Project name (last segment of the path)
 */
const getProjectName = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
};

/**
 * ProjectList component - Displays a paginated list of projects with hover animations
 *
 * A comprehensive project listing interface with pagination, hover effects, and
 * project management features. Shows project metadata including creation date,
 * session count, and provides access to project settings.
 *
 * @param projects - Array of projects to display
 * @param onProjectClick - Callback when a project card is clicked
 * @param onProjectSettings - Optional callback for project settings access
 * @param loading - Whether the list is in loading state
 * @param className - Additional CSS classes for styling
 *
 * @example
 * ```tsx
 * <ProjectList
 *   projects={projectList}
 *   onProjectClick={(project) => {
 *     console.log('Opening project:', project.path);
 *     navigateToProject(project);
 *   }}
 *   onProjectSettings={(project) => {
 *     setSelectedProject(project);
 *     setShowSettings(true);
 *   }}
 *   loading={isLoading}
 * />
 * ```
 */
export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onProjectClick,
  onProjectSettings,
  className,
}) => {
  const { t } = useI18n();
  const [currentPage, setCurrentPage] = useState(1);
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(HIDDEN_PROJECTS_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Save hidden projects to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(HIDDEN_PROJECTS_KEY, JSON.stringify([...hiddenProjects]));
  }, [hiddenProjects]);

  // Toggle project hidden state
  const toggleProjectHidden = (projectId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setHiddenProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // Check if a project is hidden
  const isProjectHidden = (projectId: string) => hiddenProjects.has(projectId);

  // Filter and sort projects based on hidden state
  const filteredProjects = React.useMemo(() => {
    if (showHidden) {
      // Show all projects but put hidden ones at the end
      const visible = projects.filter(p => !isProjectHidden(p.id));
      const hidden = projects.filter(p => isProjectHidden(p.id));
      return [...visible, ...hidden];
    } else {
      // Only show visible projects
      return projects.filter(p => !isProjectHidden(p.id));
    }
  }, [projects, hiddenProjects, showHidden]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentProjects = filteredProjects.slice(startIndex, endIndex);

  // Reset to page 1 only if current page is out of bounds
  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const hiddenCount = hiddenProjects.size;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Hidden projects toggle */}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="show-hidden" className="text-sm font-medium cursor-pointer">
              显示隐藏的项目 ({hiddenCount})
            </Label>
          </div>
          <Switch
            id="show-hidden"
            checked={showHidden}
            onCheckedChange={setShowHidden}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {currentProjects.map((project, index) => {
          const hidden = isProjectHidden(project.id);
          return (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.05,
              ease: [0.4, 0, 0.2, 1],
            }}
          >
            <Card
                className={cn(
                  "p-3 hover:shadow-md transition-all duration-200 cursor-pointer group",
                  hidden && "opacity-60 border-dashed"
                )}
              onClick={() => onProjectClick(project)}
            >
              <div className="flex flex-col">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <FolderOpen className={cn("h-4 w-4 shrink-0", hidden ? "text-muted-foreground" : "text-primary")} />
                      <h3 className="font-semibold text-sm truncate">
                        {getProjectName(project.path)}
                      </h3>
                      {hidden && (
                        <Badge variant="secondary" className="shrink-0 ml-1 text-xs py-0 h-4">
                          <EyeOff className="h-2.5 w-2.5 mr-0.5" />
                          隐藏
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* 眼睛图标按钮 - 切换隐藏状态 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => toggleProjectHidden(project.id, e)}
                        title={hidden ? "取消隐藏" : "隐藏项目"}
                      >
                        {hidden ? (
                          <Eye className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    {project.sessions.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs py-0 h-5">
                        {project.sessions.length}
                      </Badge>
                    )}
                    </div>
                  </div>

                                      <p className="text-xs text-muted-foreground mb-2 font-mono truncate">
                    {project.path}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatTimeAgo(project.created_at * 1000)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{project.sessions.length}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onProjectSettings && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onProjectSettings(project);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            {t.projects.hooks}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
          );
        })}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
    </div>
  );
};
