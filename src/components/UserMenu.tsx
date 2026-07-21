"use client";

import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import LogoutIcon from "@mui/icons-material/Logout";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { logoutAction } from "@/app/login/actions";

export interface AdminInfo {
  name: string;
  email: string;
  role: "owner" | "admin";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Top-bar identity + account menu. Shows who is currently logged in and offers
// sign out (via the logout server action).
export default function UserMenu({ admin }: { admin: AdminInfo }) {
  const [anchor, setAnchor] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchor);

  return (
    <>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        color="inherit"
        sx={{ textTransform: "none", borderRadius: 2, pl: 0.5, pr: 1 }}
        endIcon={<KeyboardArrowDownIcon />}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            mr: 1,
            bgcolor: "primary.main",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {initials(admin.name)}
        </Avatar>
        <Box sx={{ textAlign: "left", display: { xs: "none", sm: "block" } }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {admin.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {admin.email}
          </Typography>
        </Box>
      </Button>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 220, mt: 1 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {admin.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {admin.email}
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <Chip
              size="small"
              label={admin.role === "owner" ? "Owner" : "Admin"}
              color={admin.role === "owner" ? "primary" : "default"}
              variant="outlined"
            />
          </Box>
        </Box>
        <Divider />
        <form action={logoutAction}>
          <MenuItem component="button" type="submit" sx={{ width: "100%" }}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            Sign out
          </MenuItem>
        </form>
      </Menu>
    </>
  );
}
