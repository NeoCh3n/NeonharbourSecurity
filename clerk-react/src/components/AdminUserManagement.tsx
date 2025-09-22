import { useState } from 'react';
import {
  Container,
  Header,
  Table,
  Button,
  SpaceBetween,
  Badge,
  StatusIndicator,
  Modal,
  FormField,
  Select,
  Box,
  Flashbar
} from '@cloudscape-design/components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/api';
import { USER_ROLES, type UserRole } from '../hooks/useAuth';
import { RequirePermission } from './ProtectedComponent';
import { PERMISSIONS } from '../hooks/useAuth';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  createdAt: string;
  lastSignInAt?: string;
  banned: boolean;
}

interface UserListResponse {
  users: User[];
  totalCount: number;
}

export function AdminUserManagement() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRole, setNewRole] = useState<UserRole | null>(null);
  const [flashMessages, setFlashMessages] = useState<any[]>([]);

  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const usersQuery = useQuery<UserListResponse, Error>({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.get<UserListResponse>('/admin/users'),
    staleTime: 30_000,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      apiClient.patch(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setFlashMessages([{
        type: 'success',
        id: 'role-updated',
        header: 'Role updated successfully',
        dismissible: true
      }]);
      setShowRoleModal(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      setFlashMessages([{
        type: 'error',
        id: 'role-update-failed',
        header: 'Failed to update role',
        content: error.message,
        dismissible: true
      }]);
    }
  });

  const banUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiClient.patch(`/admin/users/${userId}/ban`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setFlashMessages([{
        type: 'success',
        id: 'user-banned',
        header: 'User banned successfully',
        dismissible: true
      }]);
    },
    onError: (error: any) => {
      setFlashMessages([{
        type: 'error',
        id: 'ban-failed',
        header: 'Failed to ban user',
        content: error.message,
        dismissible: true
      }]);
    }
  });

  const unbanUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiClient.patch(`/admin/users/${userId}/unban`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setFlashMessages([{
        type: 'success',
        id: 'user-unbanned',
        header: 'User unbanned successfully',
        dismissible: true
      }]);
    },
    onError: (error: any) => {
      setFlashMessages([{
        type: 'error',
        id: 'unban-failed',
        header: 'Failed to unban user',
        content: error.message,
        dismissible: true
      }]);
    }
  });

  const handleRoleChange = () => {
    if (selectedUser && newRole) {
      updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole });
    }
  };

  const handleBanToggle = (user: User) => {
    if (user.banned) {
      unbanUserMutation.mutate(user.id);
    } else {
      banUserMutation.mutate(user.id);
    }
  };

  const roleOptions = Object.values(USER_ROLES).map(role => ({
    label: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
    value: role
  }));

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case USER_ROLES.ADMIN: return 'red';
      case USER_ROLES.ANALYST: return 'blue';
      case USER_ROLES.DEMO_USER: return 'green';
      default: return 'grey';
    }
  };

  const columnDefinitions = [
    {
      id: 'email',
      header: 'Email',
      cell: (user: User) => user.email,
      sortingField: 'email'
    },
    {
      id: 'name',
      header: 'Name',
      cell: (user: User) => `${user.firstName || ''} ${user.lastName || ''}`.trim() || '—'
    },
    {
      id: 'role',
      header: 'Role',
      cell: (user: User) => (
        <Badge color={getRoleBadgeColor(user.role)}>
          {user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('_', ' ')}
        </Badge>
      )
    },
    {
      id: 'status',
      header: 'Status',
      cell: (user: User) => (
        <StatusIndicator type={user.banned ? 'error' : 'success'}>
          {user.banned ? 'Banned' : 'Active'}
        </StatusIndicator>
      )
    },
    {
      id: 'lastSignIn',
      header: 'Last Sign In',
      cell: (user: User) => user.lastSignInAt 
        ? new Date(user.lastSignInAt).toLocaleDateString()
        : '—'
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (user: User) => (
        <SpaceBetween direction="horizontal" size="xs">
          <Button
            onClick={() => {
              setSelectedUser(user);
              setNewRole(user.role);
              setShowRoleModal(true);
            }}
          >
            Change Role
          </Button>
          <Button
            variant={user.banned ? 'primary' : 'normal'}
            onClick={() => handleBanToggle(user)}
            loading={banUserMutation.isPending || unbanUserMutation.isPending}
          >
            {user.banned ? 'Unban' : 'Ban'}
          </Button>
        </SpaceBetween>
      )
    }
  ];

  return (
    <RequirePermission permission={PERMISSIONS.MANAGE_USERS} showFallback>
      <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button
                iconName="refresh"
                onClick={() => usersQuery.refetch()}
                loading={usersQuery.isFetching}
              >
                Refresh
              </Button>
            }
          >
            User Management
          </Header>
        }
      >
        {flashMessages.length > 0 && (
          <Flashbar items={flashMessages} />
        )}
        
        <Table
          items={usersQuery.data?.users || []}
          columnDefinitions={columnDefinitions}
          loading={usersQuery.isLoading}
          loadingText="Loading users..."
          empty={
            <Box textAlign="center" padding="s">
              No users found
            </Box>
          }
          trackBy="id"
          resizableColumns
          stickyHeader
        />

        <Modal
          visible={showRoleModal}
          onDismiss={() => setShowRoleModal(false)}
          header="Change User Role"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setShowRoleModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleRoleChange}
                  loading={updateRoleMutation.isPending}
                  disabled={!newRole || newRole === selectedUser?.role}
                >
                  Update Role
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          {selectedUser && (
            <SpaceBetween size="m">
              <Box>
                <strong>User:</strong> {selectedUser.email}
              </Box>
              <FormField label="New Role">
                <Select
                  selectedOption={roleOptions.find(opt => opt.value === newRole) || null}
                  onChange={({ detail }) => setNewRole(detail.selectedOption.value as UserRole)}
                  options={roleOptions}
                  placeholder="Select a role"
                />
              </FormField>
            </SpaceBetween>
          )}
        </Modal>
      </Container>
    </RequirePermission>
  );
}