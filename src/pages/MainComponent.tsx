import React, {} from 'react';
import { Outlet } from 'react-router-dom'
import {
  TopNavigation,
  AppLayout,
  ContentLayout,
  SideNavigation,
} from '@cloudscape-design/components';

import { AuthUser } from 'aws-amplify/auth';

interface MainComponentProps {
  signOut: Function | undefined;
  user: AuthUser | undefined;
}

const MainComponent: React.FC<MainComponentProps> = (props) => {

  const clickSignOut = () => {
    if (props.signOut) {
      props.signOut();
    }
  }

  return (
    <>
      <TopNavigation
        identity={{
          href: "/",
          title: "Short-form Creator",
        }}
        utilities={[
          {
            type: "menu-dropdown",
            text: props.user?.signInDetails?.loginId,
            description: props.user?.signInDetails?.loginId,
            iconName: "user-profile",
            items: [
              { id: "signOut", text: "Sign out" }
            ],
            onItemClick: clickSignOut
          }
        ]}
      />
      <AppLayout
        toolsHide={true}
        navigation={
          <SideNavigation
            header={{
              href: '/',
              text: 'Short-form Creator',
            }}
            items={[
              { type: 'link', text: `Create Short-form`, href: `/` },
              { type: 'link', text: `Short-form History`, href: `/history` },
              { type: 'link', text: `Short-form Gallery`, href: `/gallery` },
            ]}
          />
        }
        content={
          <ContentLayout>
            <Outlet />
          </ContentLayout>
        }
      />
    </>
  );
};

export default MainComponent;
