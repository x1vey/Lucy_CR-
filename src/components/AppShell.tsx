"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import InsightsIcon from "@mui/icons-material/Insights";
import PeopleIcon from "@mui/icons-material/People";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DynamicFormIcon from "@mui/icons-material/DynamicForm";
import SellIcon from "@mui/icons-material/Sell";
import HistoryIcon from "@mui/icons-material/History";
import LinkIcon from "@mui/icons-material/Link";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import ExtensionIcon from "@mui/icons-material/Extension";
import AutoAwesomeMotionIcon from "@mui/icons-material/AutoAwesomeMotion";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import CircleIcon from "@mui/icons-material/Circle";
import Tooltip from "@mui/material/Tooltip";
import { alpha } from "@mui/material/styles";
import UserMenu, { type AdminInfo } from "@/components/UserMenu";
import { useColorMode } from "@/components/ThemeRegistry";

const DRAWER_WIDTH = 256;

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Nav grouped into sections for a cleaner sidebar.
const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [{ href: "/dashboard", label: "Analytics", icon: <InsightsIcon /> }],
  },
  {
    heading: "CRM",
    items: [
      { href: "/contacts", label: "Contacts", icon: <PeopleIcon /> },
      { href: "/tags", label: "Tags", icon: <SellIcon /> },
      { href: "/tags/history", label: "Tag activity", icon: <HistoryIcon /> },
    ],
  },
  {
    heading: "Products",
    items: [
      { href: "/products", label: "Products", icon: <Inventory2Icon /> },
      {
        href: "/products/history",
        label: "Product history",
        icon: <ReceiptLongIcon />,
      },
      { href: "/calendar", label: "Calendars", icon: <EventAvailableIcon /> },
    ],
  },
  {
    heading: "Acquisition",
    items: [
      { href: "/forms", label: "Forms", icon: <DynamicFormIcon /> },
      {
        href: "/automations",
        label: "Automations",
        icon: <AutoAwesomeMotionIcon />,
      },
      { href: "/utm", label: "UTM links", icon: <LinkIcon /> },
    ],
  },
  {
    heading: "Settings",
    items: [
      { href: "/admins", label: "Admins", icon: <AdminPanelSettingsIcon /> },
      {
        href: "/settings/integrations",
        label: "Integrations",
        icon: <ExtensionIcon />,
      },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export default function AppShell({
  children,
  backend = "memory",
  admin,
}: {
  children: React.ReactNode;
  backend?: "supabase" | "memory";
  admin?: AdminInfo;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { mode, toggle } = useColorMode();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href ||
        (pathname.startsWith(href) &&
          // don't let a parent light up when on its /history child
          !(href === "/products" && pathname.startsWith("/products/history")) &&
          !(href === "/tags" && pathname.startsWith("/tags/history")));

  const currentLabel =
    ALL_ITEMS.find((n) => isActive(n.href))?.label ?? "Lucy CRM";

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ px: 2.5, gap: 1.25 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: (t) =>
              `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.secondary.main})`,
            boxShadow: (t) => `0 4px 12px ${alpha(t.palette.primary.main, 0.4)}`,
          }}
        >
          <SellIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ lineHeight: 1 }}>
          <Typography sx={{ fontWeight: 800, letterSpacing: -0.5, fontSize: 18 }}>
            Lucy CRM
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Contacts · Products · Forms
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <Box sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 1 }}>
        {NAV_SECTIONS.map((section) => (
          <List
            key={section.heading}
            subheader={
              <ListSubheader
                disableSticky
                sx={{
                  bgcolor: "transparent",
                  lineHeight: "32px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "text.secondary",
                }}
              >
                {section.heading}
              </ListSubheader>
            }
            sx={{ py: 0, mb: 0.5 }}
          >
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <ListItemButton
                  key={item.href}
                  component={NextLink}
                  href={item.href}
                  selected={active}
                  onClick={() => setMobileOpen(false)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.25,
                    position: "relative",
                    color: active ? "primary.main" : "text.secondary",
                    "&.Mui-selected": {
                      bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                      "&:hover": {
                        bgcolor: (t) => alpha(t.palette.primary.main, 0.16),
                      },
                      "& .MuiListItemIcon-root": { color: "primary.main" },
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        left: 4,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 3,
                        height: 18,
                        borderRadius: 3,
                        bgcolor: "primary.main",
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: 14,
                      fontWeight: active ? 700 : 500,
                      color: active ? "text.primary" : "text.primary",
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        ))}
      </Box>
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 1,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: (t) =>
              alpha(
                backend === "supabase"
                  ? t.palette.success.main
                  : t.palette.warning.main,
                0.08,
              ),
          }}
        >
          <CircleIcon
            sx={{
              fontSize: 10,
              color: backend === "supabase" ? "success.main" : "warning.main",
            }}
          />
          <Box sx={{ lineHeight: 1.2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
              {backend === "supabase" ? "Live database" : "Demo data"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {backend === "supabase" ? "Supabase connected" : "Supabase off"}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen((o) => !o)}
            sx={{ mr: 1, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
            {currentLabel}
          </Typography>
          <Tooltip title={mode === "light" ? "Dark mode" : "Light mode"}>
            <IconButton onClick={toggle} sx={{ mr: 0.5 }}>
              {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
          {admin && <UserMenu admin={admin} />}
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              borderRight: "1px solid",
              borderColor: "divider",
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minWidth: 0,
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
